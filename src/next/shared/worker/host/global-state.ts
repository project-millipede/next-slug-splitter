/**
 * Shared process-global host state helpers for long-lived worker clients.
 *
 * @remarks
 * Both the proxy worker host and the build worker host need the same three
 * state buckets:
 * - `client`, which carries worker-family-specific session and dedupe maps
 * - `protocol`, which owns host-side IPC request sequencing
 * - `processShutdown`, which keeps shutdown-hook installation idempotent
 *
 * The worker families still own the exact `client` shape. This module only
 * centralizes the process-global singleton pattern so they no longer duplicate
 * the `globalThis` plumbing around those shared buckets.
 */

/**
 * Shared host-side IPC protocol state.
 *
 * @remarks
 * This state currently tracks only the monotonic request-id sequence used to
 * correlate IPC requests and responses for long-lived worker sessions.
 */
export type SharedWorkerHostProtocolState = {
  /**
   * Monotonic host-side request id sequence.
   */
  requestSequence: number;
};

/**
 * Shared process-shutdown state for graceful worker cleanup.
 *
 * @remarks
 * Different worker families may install different hook sets, but they all need
 * the same idempotency guarantees:
 * - install hooks only once
 * - collapse repeated shutdown signals onto one in-flight cleanup promise
 */
export type SharedWorkerHostProcessShutdownState = {
  /**
   * Whether the relevant process hooks have already been installed.
   */
  hasInstalledHooks: boolean;
  /**
   * In-flight graceful shutdown promise, when one shutdown sequence is already
   * running.
   */
  shutdownPromise: Promise<void> | null;
};

/**
 * Full process-global host state shared by one worker family.
 *
 * @remarks
 * Keeping the client, protocol, and shutdown buckets together behind one
 * generic helper gives the codebase exactly one place that touches `globalThis`
 * for worker-host singleton behavior.
 */
export type SharedWorkerHostGlobalState<TClientState> = {
  /**
   * Worker-family-specific client state for sessions and request dedupe.
   */
  client: TClientState;
  /**
   * Host-side IPC protocol state.
   */
  protocol: SharedWorkerHostProtocolState;
  /**
   * Process-shutdown state for graceful cleanup.
   */
  processShutdown: SharedWorkerHostProcessShutdownState;
};

/**
 * Create a fresh shared protocol-state bucket.
 *
 * @returns Newly initialized protocol state.
 */
export const createSharedWorkerHostProtocolState =
  (): SharedWorkerHostProtocolState => ({
    requestSequence: 0
  });

/**
 * Create a fresh shared process-shutdown-state bucket.
 *
 * @returns Newly initialized process-shutdown state.
 */
export const createSharedWorkerHostProcessShutdownState =
  (): SharedWorkerHostProcessShutdownState => ({
    hasInstalledHooks: false,
    shutdownPromise: null
  });

/**
 * Create one fresh process-global host-state object.
 *
 * @param createClientState - Worker-family-specific client-state initializer.
 * @returns Newly initialized host-global state.
 */
const createSharedWorkerHostGlobalState = <TClientState>(
  createClientState: () => TClientState
): SharedWorkerHostGlobalState<TClientState> => ({
  client: createClientState(),
  protocol: createSharedWorkerHostProtocolState(),
  processShutdown: createSharedWorkerHostProcessShutdownState()
});

/**
 * Augmented global object shape that may already hold one shared host state.
 */
type SharedWorkerHostGlobal = typeof globalThis & {
  [key: symbol]: SharedWorkerHostGlobalState<unknown> | undefined;
};

/**
 * Read or create the process-global host-worker singleton state for one worker
 * family.
 *
 * @param symbolKey - Stable `Symbol.for(...)` key used to store the
 * worker-family state object on `globalThis`.
 * @param createClientState - Worker-family-specific client-state
 * initializer.
 * @returns Shared host-global state for the current parent process.
 */
export const getSharedWorkerHostGlobalState = <TClientState>(
  symbolKey: string,
  createClientState: () => TClientState
): SharedWorkerHostGlobalState<TClientState> => {
  const sharedStateSymbol = Symbol.for(symbolKey);
  const globalWorkerHost = globalThis as SharedWorkerHostGlobal;
  const existingState = globalWorkerHost[sharedStateSymbol];

  if (existingState != null) {
    return existingState as SharedWorkerHostGlobalState<TClientState>;
  }

  const createdState = createSharedWorkerHostGlobalState(createClientState);
  globalWorkerHost[sharedStateSymbol] = createdState;

  return createdState;
};
