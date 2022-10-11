export enum ErrorType {
  System = 'System',
  User = 'User',
}

export class BaseError extends Error {
  errorType = ErrorType.System;

  constructor(message: string) {
    super(message);
    Object.defineProperty(this, 'name', {
      value: new.target.name,
      enumerable: false,
      writable: true,
      configurable: true,
    });
  }
}

export class SystemError extends BaseError {
  errorType = ErrorType.System;
}

export class UserError extends BaseError {
  errorType = ErrorType.User;
}

export class NetworkError extends BaseError {
  errorType = ErrorType.System;
  constructor(message?: string) {
    super(message ?? 'Network unavailable');
  }
}

export class InvalidCaptchaError extends UserError {
  constructor(message?: string) {
    super(message ?? 'Invalid captcha');
  }
}

export class InvalidCredentialError extends UserError {
  constructor(message?: string) {
    super(message ?? 'Invalid captcha');
  }
}

export class ServiceUnavailableError extends SystemError {
  constructor(message?: string) {
    super(message ?? 'Service is not available');
  }
}

export class AccountSuspendedError extends UserError {
  constructor(message?: string) {
    super(message ?? 'Account is suspended');
  }
}

export class MaxCaptchaRetryError extends UserError {
  constructor(message?: string) {
    super(message ?? 'Invalid captcha');
  }
}

export class MaxCredentialRetryError extends UserError {
  constructor(message?: string) {
    super(message ?? 'Invalid captcha');
  }
}

export class UnknownStateTransitionError extends SystemError {
  public readonly debugInfo: any;
  constructor({ event, context }: { event: any; context: any }) {
    super('UnknownStateTransitionError occurred');
    this.debugInfo = { event, context };
  }
}
