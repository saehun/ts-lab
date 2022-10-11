import { StateHandler, Event, Context, Return } from './decorators';
import {
  InvalidCaptchaError,
  InvalidCredentialError,
  MaxCaptchaRetryError,
  MaxCredentialRetryError,
  UnknownStateTransitionError,
} from './error';
import { LoginContext, LoginEvent } from './login.state-machine';
import { Prompter } from './prompter';
import { CaptchaImageRequester, CaptchaMLRequester, LoginRequester } from './requesters';

export class LoginService {
  constructor(
    private readonly prompter: Prompter,
    private readonly loginRequester: LoginRequester,
    private readonly captchaMLRequester: CaptchaMLRequester,
    private readonly captchaImageRequester: CaptchaImageRequester
  ) {}

  @StateHandler('PROMPT_CREDENTIAL')
  async handlePromptCredential(@Event() event: LoginEvent) {
    if (event.type === 'FAIL_CAPTCHA') {
      await this.prompter.alert({ title: 'Id or password is invalid', description: 'check again' });
    }

    const credential = await this.prompter.promptCredential();
    return { type: 'NEXT', credential };
  }

  @StateHandler('ML_CAPTCHA')
  async handleMLCaptcha() {
    const { image, token } = await this.captchaImageRequester.request();
    const { answer: value } = await this.captchaMLRequester.request(image);
    return { type: 'NEXT', captcha: { token, value } };
  }

  @StateHandler('PROMPT_CAPTCHA')
  async handlePromptCaptcha(@Event() event: LoginEvent) {
    if (event.type === 'FAIL_CAPTCHA') {
      await this.prompter.alert({ title: 'Captcha is invalid', description: 'check again' });
    }
    const { image, token } = await this.captchaImageRequester.request();
    const { value, reload } = await this.prompter.promptCaptcha(image);
    if (reload) {
      return { type: 'RELOAD_CAPTCHA' };
    }
    return { type: 'NEXT', captcha: { token, value } };
  }

  @StateHandler('LOGIN')
  async handleLogin(
    @Context('credential') credential: LoginContext['credential'],
    @Context('captcha') captcha: LoginContext['captcha']
  ) {
    try {
      const { id, password } = credential;
      const { value, token } = captcha;
      const result = await this.loginRequester.request({
        id,
        password,
        captchaToken: token,
        captchaValue: value,
      });
      return { type: 'NEXT', result };
    } catch (e) {
      if (e instanceof InvalidCaptchaError) {
        return { type: 'FAIL_CAPTCHA' };
      }
      if (e instanceof InvalidCredentialError) {
        return { type: 'FAIL_CREDENTIAL' };
      }
      throw e;
    }
  }

  @StateHandler('FAIL')
  async handleFail(@Event() event: LoginEvent, @Context() context: LoginContext) {
    if (event.type === 'FAIL_CAPTCHA') {
      throw new MaxCaptchaRetryError();
    }
    if (event.type === 'FAIL_CREDENTIAL') {
      throw new MaxCredentialRetryError();
    }
    throw new UnknownStateTransitionError({ event, context });
  }

  @StateHandler('DONE')
  async handleDone(@Return() returnValue: (value: unknown) => void, @Context('result') result: LoginContext['result']) {
    returnValue(result);
  }
}
