import { Interpreter } from 'xstate';
import {
  InvalidCaptchaError,
  InvalidCredentialError,
  MaxCaptchaRetryError,
  MaxCredentialRetryError,
  UnknownStateTransitionError,
} from './error';
import { LoginContext, LoginEvent, LoginTypeState } from './login.state-machine';
import { Prompter } from './prompter';
import { CaptchaImageRequester, CaptchaMLRequester, LoginRequester } from './requesters';

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
