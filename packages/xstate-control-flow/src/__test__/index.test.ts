import { loginStateMachine, LoginService } from '../index';
import { CaptchaImageRequester, CaptchaMLRequester, LoginRequester } from '../requesters';
import { Prompter } from '../prompter';
import { interpret } from 'xstate';
import { mock } from 'jest-mock-extended';
import { InvalidCaptchaError, InvalidCredentialError } from '../error';

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
    expect(mock.callerArray).toMatchInlineSnapshot(`
      [
        "prompter.promptCredential()",
        "captchaImageRequester.request()",
        "captchaMLRequester.request("mock_image")",
        "loginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
      ]
    `);
  });

  /*
  it('can retry failed credential', async () => {
    const { loginService, mock } = createSuite();

    mock.prompter.promptCredential.mockResolvedValue({ id: 'mock_id', password: 'mock_pwd' });
    mock.captchaImageRequester.request.mockResolvedValue({ image: 'mock_image', token: 'mock_token' });
    mock.captchaMLRequester.request.mockResolvedValue({ answer: '00000' });
    mock.loginRequester.request.mockRejectedValue(new InvalidCredentialError());
    await expect(() => loginService.start()).rejects.toMatchInlineSnapshot(
      `[MaxCredentialRetryError: Invalid captcha]`
    );

    expect(mock.callerArray).toMatchInlineSnapshot(`
      [
        "prompter.promptCredential()",
        "captchaImageRequester.request()",
        "captchaMLRequester.request("mock_image")",
        "loginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
        "prompter.promptCredential()",
        "captchaImageRequester.request()",
        "captchaMLRequester.request("mock_image")",
        "loginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
        "prompter.promptCredential()",
        "captchaImageRequester.request()",
        "captchaMLRequester.request("mock_image")",
        "loginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
        "prompter.promptCredential()",
        "captchaImageRequester.request()",
        "captchaMLRequester.request("mock_image")",
        "loginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
      ]
    `);
  });

  it('use prompt captcha when ML captcha failed 5 times', async () => {
    const { loginService, mock } = createSuite();

    mock.prompter.promptCredential.mockResolvedValue({ id: 'mock_id', password: 'mock_pwd' });
    mock.captchaImageRequester.request.mockResolvedValue({ image: 'mock_image', token: 'mock_token' });
    mock.captchaMLRequester.request.mockResolvedValue({ answer: '00000' });
    mock.loginRequester.request.mockRejectedValue(new InvalidCaptchaError());
    await expect(() => loginService.start()).rejects.toMatchInlineSnapshot(
      `[MaxCredentialRetryError: Invalid captcha]`
    );

    expect(mock.callerArray).toMatchInlineSnapshot(`
      [
        "prompter.promptCredential()",
        "captchaImageRequester.request()",
        "captchaMLRequester.request("mock_image")",
        "loginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
        "prompter.promptCredential()",
        "captchaImageRequester.request()",
        "captchaMLRequester.request("mock_image")",
        "loginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
        "prompter.promptCredential()",
        "captchaImageRequester.request()",
        "captchaMLRequester.request("mock_image")",
        "loginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
        "prompter.promptCredential()",
        "captchaImageRequester.request()",
        "captchaMLRequester.request("mock_image")",
        "loginRequester.request({"id":"mock_id","password":"mock_pwd","captchaToken":"mock_token","captchaValue":"00000"})",
      ]
    `);
  });
  */
});

function createSuite() {
  const loginMachineInterpreter = interpret(loginStateMachine);
  const callerArray: string[] = [];

  const prompter = applyProxy('prompter', mock<Prompter>());
  const loginRequester = applyProxy('loginRequester', mock<LoginRequester>());
  const captchaMLRequester = applyProxy('captchaMLRequester', mock<CaptchaMLRequester>());
  const captchaImageRequester = applyProxy('captchaImageRequester', mock<CaptchaImageRequester>());

  function applyProxy(name: string, mock: any) {
    return new Proxy(mock, {
      get(_, key) {
        const value = mock[key];
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
        callerArray.push(methodName + `${JSON.stringify(argumentsList).replace(/^\[/, '(').replace(/\]$/, ')')}`);
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

  const toMatchInlineSnapshot = expect({
    prompter: {
      promptCredential: prompter.promptCredential.mock.calls,
      promptCaptcha: prompter.promptCaptcha.mock.calls,
      loading: prompter.loading.mock.calls,
      alert: prompter.alert.mock.calls,
    },
    loginRequester: loginRequester.request.mock.calls,
    captchaMLRequester: captchaMLRequester.request.mock.calls,
    captchaImageRequester: captchaImageRequester.request.mock.calls,
  }).toMatchInlineSnapshot;

  return {
    loginService,
    mock: {
      prompter,
      loginRequester,
      captchaMLRequester,
      captchaImageRequester,
      toMatchInlineSnapshot,
      callerArray,
    },
  };
}
