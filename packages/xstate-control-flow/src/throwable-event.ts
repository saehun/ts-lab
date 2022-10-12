export class TransitionEvent {
  constructor(public readonly type: string, public readonly key?: string, public readonly value?: any) {}
}

export function sendEvent(type: string): never;
export function sendEvent(type: string, save: { key: string; value: any }): never;
export function sendEvent(type: string, save?: { key: string; value: any }): never {
  throw new TransitionEvent(type, save?.key, save?.value);
}
