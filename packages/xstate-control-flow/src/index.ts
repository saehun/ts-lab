import { assign, createMachine, interpret, Interpreter } from 'xstate';
import { StateListener } from 'xstate/lib/interpreter';
import { waitFor } from 'xstate/lib/waitFor';

type LoginContext = {
  retry: {
    credential: number;
    captchaML: number;
    captcha: number;
  };
  credential?: {
    id: string;
    password: string;
  };
  captcha?: {
    token: string;
    value: string;
  };
  result?: any;
};

type LoginEvent =
  | { type: 'NEXT'; credential: LoginContext['credential'] }
  | { type: 'NEXT'; captcha: LoginContext['captcha'] }
  | { type: 'NEXT'; result: LoginContext['result'] }
  | { type: 'RELOAD_CAPTCHA' }
  | { type: 'FAIL_CAPTCHA' }
  | { type: 'FAIL_CREDENTIAL' };

type LoginState = 'PROMPT_CREDENTIAL' | 'ML_CAPTCHA' | 'PROMPT_CAPTCHA' | 'LOGIN' | 'DONE' | 'FAIL';

type TypeStateOf<T extends string> = {
  [Value in T]: {
    value: Value;
    context: LoginContext;
  };
}[T];

type LoginTypeState = TypeStateOf<LoginState>;

function initializeContext(): LoginContext {
  return {
    retry: {
      captcha: 0,
      captchaML: 0,
      credential: 0,
    },
  };
}

function saveCredential() {
  return assign<LoginContext, Extract<LoginEvent, { type: 'NEXT'; credential: any }>>({
    credential: (_, event) => event.credential,
  });
}

function saveCaptcha() {
  return assign<LoginContext, Extract<LoginEvent, { type: 'NEXT'; captcha: any }>>({
    captcha: (_, event) => event.captcha,
  });
}

function saveResult() {
  return assign<LoginContext, Extract<LoginEvent, { type: 'NEXT'; result: any }>>({
    result: (_, event) => event.result,
  });
}

function increaseRetry(key: keyof LoginContext['retry'], amount = 1) {
  return assign<LoginContext, any>({
    retry: context => ({
      ...context.retry,
      [key]: context.retry[key] + amount,
    }),
  });
}

const loginStateMachine = createMachine<LoginContext, LoginEvent, LoginTypeState>({
  id: 'loginStateMachine',
  initial: 'PROMPT_CREDENTIAL',
  context: initializeContext(),
  states: {
    PROMPT_CREDENTIAL: {
      on: {
        NEXT: [
          {
            target: 'ML_CAPTCHA',
            cond: context => context.retry.captchaML <= 5,
            actions: [saveCredential()],
          },
          {
            target: 'PROMPT_CAPTCHA',
            actions: [saveCredential()],
          },
        ],
      },
    },
    ML_CAPTCHA: {
      on: {
        NEXT: {
          target: 'LOGIN',
          actions: [saveCaptcha()],
        },
      },
    },
    PROMPT_CAPTCHA: {
      on: {
        NEXT: {
          target: 'LOGIN',
          actions: [saveCaptcha()],
        },
        RELOAD_CAPTCHA: { target: 'PROMPT_CAPTCHA' },
      },
    },
    LOGIN: {
      on: {
        NEXT: {
          target: 'DONE',
          actions: [saveResult()],
        },
        FAIL_CAPTCHA: [
          {
            target: 'ML_CAPTCHA',
            cond: context => context.retry.captchaML <= 5,
            actions: [increaseRetry('captchaML')],
          },
          {
            target: 'PROMPT_CAPTCHA',
            cond: context => context.retry.captcha <= 5,
            actions: [increaseRetry('captcha')],
          },
          { target: 'FAIL' },
        ],
        FAIL_CREDENTIAL: [
          {
            target: 'PROMPT_CREDENTIAL',
            cond: context => context.retry.credential <= 3,
            actions: [increaseRetry('credential')],
          },
          { target: 'FAIL' },
        ],
      },
    },
    DONE: {
      type: 'final',
    },
    FAIL: {
      type: 'final',
    },
  },
});

enum ErrorType {
  System = 'System',
  Warning = 'Warning',
  Network = 'Network',
}

const service = interpret(loginStateMachine);

type LoginStateListener = StateListener<LoginContext, LoginEvent, any, LoginTypeState>;

class LoginService {
  constructor(
    private readonly interpreter: Interpreter<LoginContext, any, LoginEvent, LoginTypeState>,
    private readonly prompter: Prompter,
    private readonly loginRequester: LoginRequester,
    private readonly captchaMLRequester: CaptchaMLRequester,
    private readonly captchaImageRequester: CaptchaImageRequester
  ) {
    this.interpreter.onTransition(async (state, event) => {
      if (state.matches('PROMPT_CREDENTIAL')) {
        if (event.type === 'FAIL_CAPTCHA') {
          await this.prompter.alert({ title: 'Id or password is invalid', description: 'check again' });
        }

        const credential = await this.prompter.promptCredential();
        return this.interpreter.send({ type: 'NEXT', credential });
      }

      if (state.matches('ML_CAPTCHA')) {
        const { image, token } = await this.captchaImageRequester.request();
        const { answer: value } = await this.captchaMLRequester.request(image);
        return this.interpreter.send({ type: 'NEXT', captcha: { token, value } });
      }

      if (state.matches('PROMPT_CAPTCHA')) {
        if (event.type === 'FAIL_CAPTCHA') {
          await this.prompter.alert({ title: 'Captcha is invalid', description: 'check again' });
        }
        const { image, token } = await this.captchaImageRequester.request();
        const { value, reload } = await this.prompter.promptCaptcha(image);
        if (reload) {
          return this.interpreter.send({ type: 'RELOAD_CAPTCHA' });
        }
        return this.interpreter.send({ type: 'NEXT', captcha: { token, value } });
      }

      if (state.matches('LOGIN')) {
        try {
          const { id, password } = state.context.credential!;
          const { value, token } = state.context.captcha!;
          const result = await this.loginRequester.request({ id, password, captchaToken: token, captchaValue: value });
          return this.interpreter.send({ type: 'NEXT', result });
        } catch (e) {
          if (e instanceof InvalidCaptchaError) {
            return this.interpreter.send({ type: 'FAIL_CAPTCHA' });
          }
          if (e instanceof InvalidCredentialError) {
            return this.interpreter.send({ type: 'FAIL_CREDENTIAL' });
          }
          throw e;
        }
      }

      if (state.matches('FAIL')) {
        if (event.type === 'FAIL_CAPTCHA') {
          throw new MaxCaptchaRetryError();
        }
        if (event.type === 'FAIL_CREDENTIAL') {
          throw new MaxCredentialRetryError();
        }
      }
    });
  }

  async start() {
    const finalState = await waitFor(this.interpreter.start(), state => state.matches('DONE') || state.matches('FAIL'));
    if (finalState.value === 'DONE') {
      return finalState.context.result;
    } else {
      return; // TODO
    }
  }
}

class BaseError extends Error {
  errorType = ErrorType;

  constructor(message: string) {
    super(message);
  }
}

class Prompter {
  constructor(private readonly appBridge: AppBrdige) {}

  async promptCredential() {
    return {
      id: '',
      password: '',
    };
  }

  async promptCaptcha(captchaImage: string) {
    return { value: '', reload: false };
  }

  async alert(options: { title: string; description: string; exit?: boolean }) {
    return;
  }

  async loading(type = 'default') {
    return;
  }

  async close() {
    return;
  }
}

type AppBrdige = any;
type HttpClient = any;

class CaptchaImageRequester {
  constructor(private readonly http: HttpClient) {}

  async request() {
    return {
      image: '',
      token: '',
    };
  }
}

class LoginRequester {
  constructor(private readonly http: HttpClient) {}

  async request(options: { id: string; password: string; captchaToken: string; captchaValue: string }) {
    return {};
  }
}

class CaptchaMLRequester {
  constructor(private readonly http: HttpClient) {}

  async request(image: string) {
    return { answer: '' };
  }
}

const prompter = new Prompter({});
const captchaImageRequester = new CaptchaImageRequester({});
const captchaMLRequester = new CaptchaMLRequester({});
const loginRequester = new LoginRequester({});
