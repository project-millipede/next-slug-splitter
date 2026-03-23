/**
 * A deferred promise container that exposes resolve and reject functions,
 * allowing external control over when the promise settles.
 *
 * @template T The type of the value the promise will resolve with.
 */
export type Deferred<T> = {
  /** The pending promise. */
  promise: Promise<T>;
  /** Resolves the deferred promise with the provided value. */
  resolve: (value: T) => void;
  /** Rejects the deferred promise with the provided error. */
  reject: (error: Error) => void;
};

/**
 * Creates a deferred promise that can be resolved or rejected externally.
 *
 * @template T The type of the value the promise will resolve with.
 * @returns A {@link Deferred} object containing the promise and control functions.
 */
export function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (error: Error) => void = () => {};

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}
