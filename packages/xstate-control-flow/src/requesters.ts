type HttpClient = any;

export class CaptchaImageRequester {
  constructor(private readonly http: HttpClient) {}

  async request() {
    return {
      image: '',
      token: '',
    };
  }
}

export class LoginRequester {
  constructor(private readonly http: HttpClient) {}

  async request(options: { id: string; password: string; captchaToken: string; captchaValue: string }) {
    return {};
  }
}

export class CaptchaMLRequester {
  constructor(private readonly http: HttpClient) {}

  async request(image: string) {
    return { answer: '' };
  }
}
