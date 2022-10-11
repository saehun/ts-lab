export class Prompter {
  constructor(private readonly appBridge: AppBrdige = () => {}) {}

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

export type AppBrdige = any;
