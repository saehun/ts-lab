import { assign, createMachine } from 'xstate';
import { StateListener } from 'xstate/lib/interpreter';

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
          actions: [saveCaptcha(), increaseRetry('captchaML')],
        },
      },
    },
    PROMPT_CAPTCHA: {
      on: {
        NEXT: {
          target: 'LOGIN',
          actions: [saveCaptcha(), increaseRetry('captcha')],
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
          },
          {
            target: 'PROMPT_CAPTCHA',
            cond: context => context.retry.captcha < 5,
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
