import { CaptchaImageRequester, CaptchaMLRequester, LoginRequester } from '../requesters';
import { Prompter } from '../prompter';
import { interpret } from 'xstate';
import { mock } from 'jest-mock-extended';
import { InvalidCaptchaError, InvalidCredentialError } from '../error';
import { loginStateMachine } from '../login.state-machine';
import { LoginService } from '../login.service';

describe('loginStateMachine and LoginService', () => {
  it('can execute', async () => {
    const { loginService, mock } = createSuite();

    mock.prompter.promptCredential.mockResolvedValue({ id: 'mock_id', password: 'mock_pwd' });
    mock.captchaImageRequester.request.mockResolvedValue({ image: 'mock_image', token: 'mock_token' });
    mock.captchaMLRequester.request.mockResolvedValue({ answer: '00000' });
    mock.loginRequester.request.mockResolvedValue({
      sessionId: 'JSESSIONID0123',
      user: { name: 'foo', email: 'foo@toss.im' },
    });

    expect(await loginService.start()).toMatchInlineSnapshot(`
      {
        "sessionId": "JSESSIONID0123",
        "user": {
          "email": "foo@toss.im",
          "name": "foo",
        },
      }
    `);
    expect(mock.invoked).toMatchInlineSnapshot(`
      [
        "Prompter.promptCredential()",
        "CaptchaImageRequester.request()",
        "CaptchaMLRequester.request("mock_image")",
        "LoginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
      ]
    `);
  });

  it('can retry failed credential', async () => {
    const { loginService, mock } = createSuite();

    mock.prompter.promptCredential.mockResolvedValue({ id: 'mock_id', password: 'mock_pwd' });
    mock.captchaImageRequester.request.mockResolvedValue({ image: 'mock_image', token: 'mock_token' });
    mock.captchaMLRequester.request.mockResolvedValue({ answer: '00000' });
    mock.loginRequester.request.mockRejectedValue(new InvalidCredentialError());
    await expect(() => loginService.start()).rejects.toMatchInlineSnapshot(
      `[MaxCredentialRetryError: Invalid captcha]`
    );

    expect(mock.invoked).toMatchInlineSnapshot(`
      [
        "Prompter.promptCredential()",
        "CaptchaImageRequester.request()",
        "CaptchaMLRequester.request("mock_image")",
        "LoginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
        "Prompter.promptCredential()",
        "CaptchaImageRequester.request()",
        "CaptchaMLRequester.request("mock_image")",
        "LoginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
        "Prompter.promptCredential()",
        "CaptchaImageRequester.request()",
        "CaptchaMLRequester.request("mock_image")",
        "LoginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
        "Prompter.promptCredential()",
        "CaptchaImageRequester.request()",
        "CaptchaMLRequester.request("mock_image")",
        "LoginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
      ]
    `);
  });

  it('use prompt captcha when ML captcha failed 5 times', async () => {
    const { loginService, mock } = createSuite();

    mock.prompter.promptCredential.mockResolvedValue({ id: 'mock_id', password: 'mock_pwd' });
    mock.prompter.promptCaptcha.mockResolvedValue({ value: '111111', reload: false });
    mock.captchaImageRequester.request.mockResolvedValue({ image: 'mock_image', token: 'mock_token' });
    mock.captchaMLRequester.request.mockResolvedValue({ answer: '00000' });
    mock.loginRequester.request.mockRejectedValue(new InvalidCaptchaError());
    await expect(() => loginService.start()).rejects.toMatchInlineSnapshot(`[MaxCaptchaRetryError: Invalid captcha]`);

    expect(mock.invoked).toMatchInlineSnapshot(`
      [
        "Prompter.promptCredential()",
        "CaptchaImageRequester.request()",
        "CaptchaMLRequester.request("mock_image")",
        "LoginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
        "CaptchaImageRequester.request()",
        "CaptchaMLRequester.request("mock_image")",
        "LoginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
        "CaptchaImageRequester.request()",
        "CaptchaMLRequester.request("mock_image")",
        "LoginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
        "CaptchaImageRequester.request()",
        "CaptchaMLRequester.request("mock_image")",
        "LoginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
        "CaptchaImageRequester.request()",
        "CaptchaMLRequester.request("mock_image")",
        "LoginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
        "Prompter.alert({"title":"Captcha is invalid","description":"check again"})",
        "CaptchaImageRequester.request()",
        "Prompter.promptCaptcha("mock_image")",
        "LoginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"111111"})",
        "Prompter.alert({"title":"Captcha is invalid","description":"check again"})",
        "CaptchaImageRequester.request()",
        "Prompter.promptCaptcha("mock_image")",
        "LoginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"111111"})",
        "Prompter.alert({"title":"Captcha is invalid","description":"check again"})",
        "CaptchaImageRequester.request()",
        "Prompter.promptCaptcha("mock_image")",
        "LoginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"111111"})",
        "Prompter.alert({"title":"Captcha is invalid","description":"check again"})",
        "CaptchaImageRequester.request()",
        "Prompter.promptCaptcha("mock_image")",
        "LoginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"111111"})",
        "Prompter.alert({"title":"Captcha is invalid","description":"check again"})",
        "CaptchaImageRequester.request()",
        "Prompter.promptCaptcha("mock_image")",
        "LoginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"111111"})",
      ]
    `);
  });

  it('can throw when unknown error occurred', async () => {
    const { loginService, mock } = createSuite();

    mock.prompter.promptCredential.mockRejectedValue(new Error('Unknown error'));
    await expect(() => loginService.start()).rejects.toMatchInlineSnapshot(`[Error: Unknown error]`);
  });
});

function createSuite() {
  const loginMachineInterpreter = interpret(loginStateMachine);
  const invoked: string[] = [];

  const prompter = createClassMock(Prompter);
  const loginRequester = createClassMock(LoginRequester);
  const captchaMLRequester = createClassMock(CaptchaMLRequester);
  const captchaImageRequester = createClassMock(CaptchaImageRequester);

  function createClassMock<T>(ctor: new (...args: any[]) => T, mockInstance = mock<T>()) {
    const name = ctor.name;
    return new Proxy(mockInstance, {
      get(_, key) {
        const value = mockInstance[key];
        if (typeof value === 'function') {
          return applyFunctionProxy(value, `${name}.${key as string}`);
        } else {
          return value;
        }
      },
    });
  }

  function applyFunctionProxy(method: any, methodName: string) {
    return new Proxy(method, {
      apply: function (target, thisArgs, argumentsList) {
        invoked.push(methodName + `${JSON.stringify(argumentsList).replace(/^\[/, '(').replace(/\]$/, ')')}`);
        return target.apply(thisArgs, argumentsList);
      },
    });
  }

  const loginService = new LoginService(
    loginMachineInterpreter,
    prompter,
    loginRequester,
    captchaMLRequester,
    captchaImageRequester
  );

  return {
    loginService,
    mock: {
      prompter,
      loginRequester,
      captchaMLRequester,
      captchaImageRequester,
      invoked,
    },
  };
}
