/**
 * One concrete externally settled async gate instance.
 *
 * @remarks
 * A gate is one shared async boundary:
 * 1. one caller creates the pending boundary
 * 2. one or more callers can wait on that same boundary
 * 3. some later code resolves or rejects it from outside the original
 *    creation call stack
 *
 * Every method on this type operates on this exact gate instance, so the
 * methods do not need an owner argument.
 */
export type AsyncGate = {
  /**
   * Wait on this exact gate instance until it resolves or rejects.
   */
  wait: () => Promise<void>;
  /**
   * Resolve this exact gate instance if no earlier settle call has already
   * completed it.
   */
  resolve: () => void;
  /**
   * Reject this exact gate instance if no earlier settle call has already
   * completed it.
   */
  reject: (error: Error) => void;
};

/**
 * Owner-keyed registry for many async gate instances.
 *
 * @remarks
 * This type mirrors the operations on {@link AsyncGate}, but each call first
 * selects one concrete gate by owner identity:
 * 1. `initialize(owner)` registers one fresh gate for that owner
 * 2. `wait(owner)` finds that owner's gate and waits on it
 * 3. `resolve(owner)` finds that owner's gate and resolves it
 * 4. `reject(owner, error)` finds that owner's gate and rejects it
 *
 * @template TOwner Object type whose exact object identity selects one gate.
 */
export type AsyncGateStore<TOwner extends object> = {
  /**
   * Register one fresh gate for one owner object.
   */
  initialize: (owner: TOwner) => void;
  /**
   * Select the gate registered for one owner object and wait until that gate
   * resolves or rejects.
   */
  wait: (owner: TOwner) => Promise<void>;
  /**
   * Select the gate registered for one owner object and resolve it if no
   * earlier settle call has already completed it.
   */
  resolve: (owner: TOwner) => void;
  /**
   * Select the gate registered for one owner object and reject it if no
   * earlier settle call has already completed it.
   */
  reject: (owner: TOwner, error: Error) => void;
};

/**
 * Custom error messages for one async gate store.
 */
export type AsyncGateStoreOptions = {
  /**
   * Error surfaced when one owner does not have a registered gate.
   */
  missingGateErrorMessage?: string;
  /**
   * Error surfaced when one owner already has a registered gate.
   */
  alreadyInitializedErrorMessage?: string;
  /**
   * Error surfaced when the gate callbacks were not captured correctly.
   */
  callbacksNotInitializedErrorMessage?: string;
};

/**
 * Custom error messages for one standalone async gate.
 */
export type AsyncGateOptions = Pick<
  AsyncGateStoreOptions,
  'callbacksNotInitializedErrorMessage'
>;

const DEFAULT_MISSING_GATE_ERROR_MESSAGE =
  'Async gate owner is missing a registered gate.';
const DEFAULT_ALREADY_INITIALIZED_ERROR_MESSAGE =
  'Async gate owner already has a registered gate.';
const DEFAULT_CALLBACKS_NOT_INITIALIZED_ERROR_MESSAGE =
  'Async gate callbacks were not initialized.';

/**
 * Create one externally settled async gate.
 *
 * @remarks
 * Sequence:
 * 1. create the pending gate
 * 2. capture its external `resolve` and `reject` callbacks
 * 3. keep the gate pending until later code settles it from outside this
 *    creation call stack
 * 4. swallow detached rejection noise so callers may wait later without
 *    triggering unhandled-rejection warnings first
 *
 * Behavioral contract:
 * 1. `wait()` always observes the same shared boundary for one gate instance
 * 2. `resolve()` settles that shared boundary successfully at most once
 * 3. `reject(error)` settles that shared boundary unsuccessfully at most once
 * 4. later settlement attempts become no-ops after the first successful
 *    resolve or reject
 * 5. the gate owns no execution step of its own; some external caller decides
 *    when settlement happens
 *
 * @returns Shared async gate.
 */
export const createAsyncGate = ({
  callbacksNotInitializedErrorMessage = DEFAULT_CALLBACKS_NOT_INITIALIZED_ERROR_MESSAGE
}: AsyncGateOptions = {}): AsyncGate => {
  let resolveGate: (() => void) | undefined;
  let rejectGate: ((error: Error) => void) | undefined;
  let settled = false;

  /**
   * Steps 1-2:
   * Create the pending shared boundary and capture the external settlement
   * callbacks that later callers will use outside this creation call stack.
   */
  const gatePromise = new Promise<void>((resolve, reject) => {
    resolveGate = resolve;
    rejectGate = reject;
  });

  if (resolveGate === undefined || rejectGate === undefined) {
    throw new Error(callbacksNotInitializedErrorMessage);
  }

  const resolveCaptured: () => void = resolveGate;
  const rejectCaptured: (error: Error) => void = rejectGate;

  /**
   * Step 4:
   * The gate may reject before one waiter reaches its later `await`, so detach
   * the rejection branch immediately to avoid unhandled-rejection noise.
   */
  gatePromise.catch(() => {});

  return {
    wait: async (): Promise<void> => {
      /**
       * Behavioral contract 1:
       * All waiters observe the same shared gate promise for this instance.
       */
      await gatePromise;
    },
    resolve: (): void => {
      if (settled) {
        return;
      }

      /**
       * Behavioral contracts 2 and 4:
       * The first successful settle wins, and every later resolve/reject call
       * becomes a no-op for this gate instance.
       */
      settled = true;
      resolveCaptured();
    },
    reject: (error: Error): void => {
      if (settled) {
        return;
      }

      /**
       * Behavioral contracts 3 and 4:
       * The first successful settle wins, and every later resolve/reject call
       * becomes a no-op for this gate instance.
       */
      settled = true;
      rejectCaptured(error);
    }
  };
};

/**
 * Create one async gate store keyed by object identity.
 *
 * @remarks
 * Sequence:
 * 1. register one fresh gate for one owner with `initialize(owner)`
 * 2. later callers may `wait(owner)` on that registered gate
 * 3. some external caller eventually `resolve(owner)` or `reject(owner, error)`
 * 4. every operation first resolves the owner-specific gate from the store
 * 5. missing-owner access fails immediately with the configured error
 *
 * Behavioral contract:
 * 1. every owner may have at most one registered gate at a time
 * 2. owner identity, not structural equality, selects the shared gate
 * 3. `wait`, `resolve`, and `reject` all operate on the same owner-scoped
 *    gate instance after registration
 * 4. the store adds owner lookup and registration rules; the underlying gate
 *    still owns idempotent settlement behavior
 *
 * @template TOwner Object type that owns one gate.
 * @param options Optional custom store error messages.
 * @returns Async gate store for one owner type.
 */
export const createAsyncGateStore = <TOwner extends object>({
  missingGateErrorMessage = DEFAULT_MISSING_GATE_ERROR_MESSAGE,
  alreadyInitializedErrorMessage = DEFAULT_ALREADY_INITIALIZED_ERROR_MESSAGE,
  callbacksNotInitializedErrorMessage = DEFAULT_CALLBACKS_NOT_INITIALIZED_ERROR_MESSAGE
}: AsyncGateStoreOptions = {}): AsyncGateStore<TOwner> => {
  /**
   * Private owner-to-gate registry.
   *
   * Key:
   * - the exact owner object instance
   * - object identity, not structural equality
   *
   * Value:
   * - the shared async gate registered for that owner
   *
   * Why `WeakMap`:
   * - keep gate bookkeeping off the public owner shape
   * - bind the private gate to the lifetime of the exact owner object
   *
   * As long as some other code still holds a strong reference to the same
   * owner object, this entry may still exist.
   *
   * Once that exact owner object is no longer strongly referenced anywhere and
   * is eventually garbage-collected, the whole `WeakMap` entry disappears too.
   *
   * @example
   * One current usage stores a private readiness gate for a host-lifecycle
   * session object:
   * 1. when that session fully closes, the gate is no longer part of the
   *    active lifecycle
   * 2. if some code still holds that exact session object, the entry may still
   *    exist
   * 3. once nothing strongly references that session object anymore, the entry
   *    becomes collectible too
   */
  const gates = new WeakMap<TOwner, AsyncGate>();

  const getGate = (owner: TOwner): AsyncGate => {
    /**
     * Sequence steps 4-5:
     * Resolve the owner-specific gate from the store and fail immediately when
     * the caller skipped registration.
     */
    const gate = gates.get(owner);

    if (gate == null) {
      throw new Error(missingGateErrorMessage);
    }

    return gate;
  };

  return {
    initialize: (owner: TOwner): void => {
      if (gates.has(owner)) {
        throw new Error(alreadyInitializedErrorMessage);
      }

      /**
       * Sequence step 1 and behavioral contracts 1-3:
       * Register exactly one fresh shared gate for this owner identity.
       */
      gates.set(
        owner,
        createAsyncGate({
          callbacksNotInitializedErrorMessage
        })
      );
    },
    wait: async (owner: TOwner): Promise<void> => {
      /**
       * Sequence step 2:
       * Wait on the gate already registered for this owner.
       */
      await getGate(owner).wait();
    },
    resolve: (owner: TOwner): void => {
      /**
       * Sequence step 3:
       * Resolve the gate already registered for this owner.
       */
      getGate(owner).resolve();
    },
    reject: (owner: TOwner, error: Error): void => {
      /**
       * Sequence step 3:
       * Reject the gate already registered for this owner.
       */
      getGate(owner).reject(error);
    }
  };
};
