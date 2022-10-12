import { EventObject, Interpreter, State } from 'xstate';
import {
  XSTATE_HANDLER_METADATA,
  XSTATE_HANDLER_PARAMETER_METADATA,
  XSTATE_HANDLER_SAVE_METADATA,
  XSTATE_HANDLER_STATE_METADATA,
} from './decorators';
import { UnknownStateTransitionError } from './error';
import { isNil, Scanner } from './scanner';
import { TransitionEvent } from './throwable-event';

export interface ServceHandlerMetadata {
  method: string;
  state: string;
  type: 'next' | 'resolve' | 'reject';
  saveTo?: string;
  params: Array<{ index: number; type: 'event' | 'context'; contextKey?: string }>;
}

export class ServiceExecutor<T = any> {
  constructor(
    private readonly interpreter: Interpreter<unknown>,
    private readonly serviceInstance: any,
    private readonly scanner = new Scanner()
  ) {}

  async start(): Promise<T> {
    // TODO: 이거 어떻게 타이핑하지
    const { promise, reject, resolve } = this.createPromise();
    this.setup(resolve, reject);
    this.interpreter.start();
    return await promise;
  }

  private setup(resolve: any, reject: any) {
    for (const { method, state: stateName, params, type, saveTo } of this.scanHandlerMetadata()) {
      this.interpreter.onTransition(async (state, event) => {
        if (!state.matches(stateName as any)) {
          return;
        }
        try {
          const instance = this.serviceInstance;
          const methodRef: (...args: any[]) => Promise<unknown> = this.serviceInstance[method];
          const argumentArray = this.buildArguments(params, state, event);
          const result = await methodRef.apply(instance, argumentArray);

          const handleResolve = () => {
            resolve(result);
          };

          const handleReject = () => {
            if (result instanceof Error) {
              reject(result);
            } else {
              reject(new UnknownStateTransitionError({ event, context: state.context, result }));
            }
          };

          const handleNext = () => {
            if (saveTo) {
              this.interpreter.send({ type: 'NEXT', setContext: { key: saveTo, value: result } } as any);
            } else {
              this.interpreter.send({ type: 'NEXT' });
            }
          };

          if (type === 'resolve') {
            handleResolve();
          } else if (type === 'reject') {
            handleReject();
          } else {
            handleNext();
          }
        } catch (e: unknown) {
          if (e instanceof TransitionEvent) {
            const setContext = e.key ? { key: e.key, value: e.value } : undefined;
            this.interpreter.send({ type: e.type, setContext } as any);
          } else {
            reject(e);
          }
        }
      });
    }
  }

  private buildArguments(params: ServceHandlerMetadata['params'], state: State<unknown>, event: EventObject) {
    const argumentList = params.reduce((arr, { index, type, contextKey }) => {
      arr[index] = type === 'event' ? event : contextKey ? state.context[contextKey] : state.context;
      return arr;
    }, []);
    return argumentList;
  }

  private scanHandlerMetadata() {
    return this.scanner
      .scanFromPrototype(
        this.serviceInstance,
        Object.getPrototypeOf(this.serviceInstance),
        method =>
          ({
            method,
            state: Reflect.getMetadata(XSTATE_HANDLER_STATE_METADATA, this.serviceInstance, method),
            params: Reflect.getMetadata(XSTATE_HANDLER_PARAMETER_METADATA, this.serviceInstance, method) || [],
            type: Reflect.getMetadata(XSTATE_HANDLER_METADATA, this.serviceInstance, method) || 'next',
            saveTo: Reflect.getMetadata(XSTATE_HANDLER_SAVE_METADATA, this.serviceInstance, method),
          } as ServceHandlerMetadata)
      )
      .filter(scanned => !isNil(scanned.state));
  }

  private createPromise() {
    let resolve: any, reject: any;
    const promise = new Promise<any>((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });
    return { promise, resolve, reject };
  }
}
