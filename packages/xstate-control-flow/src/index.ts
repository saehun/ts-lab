import { rejects } from 'assert';
import { assign, createMachine, Interpreter } from 'xstate';
import { StateListener } from 'xstate/lib/interpreter';
import { waitFor } from 'xstate/lib/waitFor';
import {
  InvalidCaptchaError,
  InvalidCredentialError,
  MaxCaptchaRetryError,
  MaxCredentialRetryError,
  UnknownStateTransitionError,
} from './error';
import { Prompter } from './prompter';
import { CaptchaImageRequester, CaptchaMLRequester, LoginRequester } from './requesters';

export type LoginContext = {
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

export type LoginEvent =
  | { type: 'NEXT'; credential: LoginContext['credential'] }
  | { type: 'NEXT'; captcha: LoginContext['captcha'] }
  | { type: 'NEXT'; result: LoginContext['result'] }
  | { type: 'RELOAD_CAPTCHA' }
  | { type: 'FAIL_CAPTCHA' }
  | { type: 'FAIL_CREDENTIAL' };

export type LoginState = 'PROMPT_CREDENTIAL' | 'ML_CAPTCHA' | 'PROMPT_CAPTCHA' | 'LOGIN' | 'DONE' | 'FAIL';

export type TypeStateOf<T extends string> = {
  [Value in T]: {
    value: Value;
    context: LoginContext;
  };
}[T];

export type LoginTypeState = TypeStateOf<LoginState>;

export type LoginStateListener = StateListener<LoginContext, LoginEvent, any, LoginTypeState>;

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

export const loginStateMachine = createMachine<LoginContext, LoginEvent, LoginTypeState>({
  id: 'loginStateMachine',
  initial: 'PROMPT_CREDENTIAL',
  predictableActionArguments: true,
  context: initializeContext(),
  states: {
    PROMPT_CREDENTIAL: {
      on: {
        NEXT: [
          {
            target: 'ML_CAPTCHA',
            cond: context => context.retry.captchaML < 5,
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
            cond: context => context.retry.captchaML < 5,
            actions: [increaseRetry('captchaML')],
          },
          {
            target: 'PROMPT_CAPTCHA',
            cond: context => context.retry.captcha < 5,
            actions: [increaseRetry('captcha')],
          },
          { target: 'FAIL' },
        ],
        FAIL_CREDENTIAL: [
          {
            target: 'PROMPT_CREDENTIAL',
            cond: context => context.retry.credential < 3,
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

export class LoginService {
  constructor(
    private readonly interpreter: Interpreter<LoginContext, any, LoginEvent, LoginTypeState>,
    private readonly prompter: Prompter,
    private readonly loginRequester: LoginRequester,
    private readonly captchaMLRequester: CaptchaMLRequester,
    private readonly captchaImageRequester: CaptchaImageRequester
  ) {}

  private setup(resolve: any, reject: any) {
    this.interpreter.onTransition(async (state, event) => {
      try {
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
            const result = await this.loginRequester.request({
              id,
              password,
              captchaToken: token,
              captchaValue: value,
            });
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

        if (state.matches('DONE')) {
          resolve(state.context.result);
          return;
        }

        if (state.matches('FAIL')) {
          if (event.type === 'FAIL_CAPTCHA') {
            throw new MaxCaptchaRetryError();
            // return this.prompter.alert({
            //   title: 'Captcha retry count exceeded',
            //   description: 'Please try again later',
            //   exit: true,
            // });
          }
          if (event.type === 'FAIL_CREDENTIAL') {
            throw new MaxCredentialRetryError();
            // return this.prompter.alert({
            //   title: 'Credential retry count exceed',
            //   description: 'Please try again later',
            //   exit: true,
            // });
          }
          throw new UnknownStateTransitionError({ event, context: state.context });
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  async start() {
    let resolve: any, reject: any;
    const promise = new Promise((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });
    this.setup(resolve, reject);
    this.interpreter.start();

    return await promise;

    // const finalState = await waitFor(this.interpreter.start(), state => state.matches('DONE') || state.matches('FAIL'));
    // return finalState.context.result;
  }
}
