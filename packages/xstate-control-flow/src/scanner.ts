export const isConstructor = (val: any): boolean => val === 'constructor';

export const isFunction = (val: any): boolean => typeof val === 'function';

export const isUndefined = (obj: any): obj is undefined => typeof obj === 'undefined';

export const isNil = (val: any): val is null | undefined => isUndefined(val) || val === null;

export class Scanner {
  public reflectKeyMetadata(component: any, key: string, method: string) {
    let prototype = component.prototype;
    do {
      const descriptor = Reflect.getOwnPropertyDescriptor(prototype, method);
      if (!descriptor) {
        continue;
      }
      return Reflect.getMetadata(key, descriptor.value);
    } while ((prototype = Reflect.getPrototypeOf(prototype)) && prototype !== Object.prototype && prototype);
    return undefined;
  }

  public scanFromPrototype<R>(instance: any, prototype: object, callback: (name: string) => R): R[] {
    void instance;
    const methodNames = new Set(this.getAllFilteredMethodNames(prototype));
    return Array.from(methodNames)
      .map(callback)
      .filter(metadata => !isNil(metadata));
  }

  *getAllFilteredMethodNames(prototype: object): IterableIterator<string> {
    const isMethod = (prop: string) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, prop);
      if (descriptor.set || descriptor.get) {
        return false;
      }
      return !isConstructor(prop) && isFunction(prototype[prop]);
    };
    do {
      yield* Object.getOwnPropertyNames(prototype).filter(isMethod);
    } while ((prototype = Reflect.getPrototypeOf(prototype)) && prototype !== Object.prototype);
  }
}
