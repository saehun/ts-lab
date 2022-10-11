import { Interpreter } from 'xstate';
import { XSTATE_HANDLER_PARAMETER_METADATA, XSTATE_HANDLER_STATE_METADATA } from './decorators';
import { isNil, Scanner } from './scanner';

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
    for (const { method, state: stateName, params } of this.scanHandlerMetadata()) {
      this.interpreter.onTransition(async (state, event) => {
        if (state.matches(stateName as any)) {
          try {
            const argumentList = params.reduce((arr, { index, type, contextKey }) => {
              arr[index] =
                type === 'event'
                  ? event
                  : type === 'return'
                  ? resolve
                  : contextKey
                  ? state.context[contextKey]
                  : state.context;
              return arr;
            }, []);
            const result = await this.serviceInstance[method](...argumentList);
            this.interpreter.send(result);
          } catch (e) {
            reject(e);
          }
        }
      });
    }
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
          } as {
            state: string;
            method: string;
            params: Array<{ index: number; type: 'event' | 'context' | 'return'; contextKey?: string }>;
          })
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
