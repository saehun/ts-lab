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
  | { type: 'NEXT' }
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

function increaseRetry(key: keyof LoginContext['retry'], amount = 1) {
  return assign<LoginContext, any>({
    retry: context => ({
      ...context.retry,
      [key]: context.retry[key] + amount,
    }),
  });
}

function setContext() {
  return assign((context: any, event: any) => {
    if ('setContext' in event) {
      return { ...context, [event.setContext.key]: event.setContext.value };
    } else {
      return context;
    }
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
            actions: [setContext()],
          },
          {
            target: 'PROMPT_CAPTCHA',
            actions: [setContext()],
          },
        ],
      },
    },
    ML_CAPTCHA: {
      on: {
        NEXT: {
          target: 'LOGIN',
          actions: [setContext(), increaseRetry('captchaML')],
        },
      },
    },
    PROMPT_CAPTCHA: {
      on: {
        NEXT: {
          target: 'LOGIN',
          actions: [setContext(), increaseRetry('captcha')],
        },
        RELOAD_CAPTCHA: { target: 'PROMPT_CAPTCHA' },
      },
    },
    LOGIN: {
      on: {
        NEXT: {
          target: 'DONE',
          actions: [setContext()],
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

/*
{
  "type": "NEXT",
  "setContext": {
    "key": "credential",
    "value": {
      "id": "foo",
      "password": "bar"
    }
  }
}
*/
