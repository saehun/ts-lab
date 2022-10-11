import 'reflect-metadata';

export const XSTATE_HANDLER_PARAMETER_METADATA = 'XSTATE_HANDLER_ARGUMENTS_METADATA';

export const XSTATE_HANDLER_STATE_METADATA = 'XSTATE_HANDLER_STATE_METADATA';

export function StateHandler(state: string) {
  return Reflect.metadata(XSTATE_HANDLER_STATE_METADATA, state);
}

export function Event() {
  return (target: object, key: string | symbol, index?: number) => {
    let dependencies = Reflect.getMetadata(XSTATE_HANDLER_PARAMETER_METADATA, target, key) || [];

    dependencies = [...dependencies, { index, type: 'event' }];
    Reflect.defineMetadata(XSTATE_HANDLER_PARAMETER_METADATA, dependencies, target, key);
    return;
  };
}

export function Context(contextKey?: string) {
  return (target: object, key: string | symbol, index?: number) => {
    let dependencies = Reflect.getMetadata(XSTATE_HANDLER_PARAMETER_METADATA, target, key) || [];

    dependencies = [...dependencies, { index, type: 'context', contextKey }];
    Reflect.defineMetadata(XSTATE_HANDLER_PARAMETER_METADATA, dependencies, target, key);
    return;
  };
}

export function Return() {
  return (target: object, key: string | symbol, index?: number) => {
    let dependencies = Reflect.getMetadata(XSTATE_HANDLER_PARAMETER_METADATA, target, key) || [];

    dependencies = [...dependencies, { index, type: 'return' }];
    Reflect.defineMetadata(XSTATE_HANDLER_PARAMETER_METADATA, dependencies, target, key);
    return;
  };
}
