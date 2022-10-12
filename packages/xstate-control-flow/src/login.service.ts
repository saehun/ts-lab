import { On, Event, Context, Resolve, Reject, Save } from './decorators';
import { InvalidCaptchaError, InvalidCredentialError, MaxCaptchaRetryError, MaxCredentialRetryError } from './error';
import { LoginContext, LoginEvent } from './login.state';
import { Prompter } from './prompter';
import { CaptchaImageRequester, CaptchaMLRequester, LoginRequester } from './requesters';
import { sendEvent } from './throwable-event';

export class LoginService {
  constructor(
    private readonly prompter: Prompter,
    private readonly loginRequester: LoginRequester,
    private readonly captchaMLRequester: CaptchaMLRequester,
    private readonly captchaImageRequester: CaptchaImageRequester
  ) {}

  @On('PROMPT_CREDENTIAL')
  @Save('credential')
  async handlePromptCredential(@Event() event: LoginEvent) {
    if (event.type === 'FAIL_CAPTCHA') {
      await this.prompter.alert({ title: 'Id or password is invalid', description: 'check again' });
    }

    const credential = await this.prompter.promptCredential();
    return credential;
  }

  @On('ML_CAPTCHA')
  @Save('captcha')
  async handleMLCaptcha() {
    const { image, token } = await this.captchaImageRequester.request();
    const { answer: value } = await this.captchaMLRequester.request(image);
    return { token, value };
  }

  @On('PROMPT_CAPTCHA')
  @Save('captcha')
  async handlePromptCaptcha(@Event() event: LoginEvent) {
    if (event.type === 'FAIL_CAPTCHA') {
      await this.prompter.alert({ title: 'Captcha is invalid', description: 'check again' });
    }
    const { image, token } = await this.captchaImageRequester.request();
    const { value, reload } = await this.prompter.promptCaptcha(image);
    if (reload) {
      return sendEvent('RELOAD_CAPTCHA');
    }
    return { token, value };
  }

  @On('LOGIN')
  @Save('result')
  async handleLogin(
    @Context('credential') credential: LoginContext['credential'],
    @Context('captcha') captcha: LoginContext['captcha']
  ) {
    try {
      const { id, password } = credential;
      const { value, token } = captcha;
      return await this.loginRequester.request({
        id,
        password,
        captchaToken: token,
        captchaValue: value,
      });
    } catch (e) {
      if (e instanceof InvalidCaptchaError) {
        return sendEvent('FAIL_CAPTCHA');
      }
      if (e instanceof InvalidCredentialError) {
        return sendEvent('FAIL_CREDENTIAL');
      }
      throw e;
    }
  }

  @On('FAIL')
  @Reject()
  async handleFail(@Event() event: LoginEvent) {
    if (event.type === 'FAIL_CAPTCHA') {
      return new MaxCaptchaRetryError();
    }
    if (event.type === 'FAIL_CREDENTIAL') {
      return new MaxCredentialRetryError();
    }
  }

  @On('DONE')
  @Resolve()
  async handleDone(@Context('result') result: LoginContext['result']) {
    return result;
  }
}
