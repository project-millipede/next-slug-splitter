import type { WorkerSessionRegistry } from '../../host/session-lifecycle';

import type {
  WorkerHostLifecycleSession,
  WorkerHostLifecycleSessionBase
} from '../types';

/**
 * Shared host-lifecycle machine type contracts.
 *
 * @remarks
 * This module intentionally exports only the public worker-family contract for
 * the parent-process session machine:
 * - public machine options
 * - public machine methods
 * - public reuse decisions
 */

/**
 * Reuse-or-replace decision for one host-managed worker session.
 */
export type WorkerHostLifecycleReuseDecision = 'reuse' | 'replace';

/**
 * Public session-definition options for one host lifecycle machine.
 *
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
export type WorkerHostLifecycleMachineSessionOptions<
  TSession extends WorkerHostLifecycleSessionBase,
  TRequest
> = {
  /**
   * Derive the stable host-side session key for one request.
   */
  createSessionKey: (request: TRequest) => string;
  /**
   * Create one fresh host-managed session.
   *
   * @remarks
   * The returned session should already have child listeners installed. Those
   * listeners can call back into the machine via
   * `observeSessionTermination`.
   */
  createSession: (input: {
    /**
     * Active worker-session registry that will own the session.
     */
    workerSessions: WorkerSessionRegistry<TSession>;
    /**
     * Worker-family request that triggered session creation.
     */
    request: TRequest;
  }) => TSession;
  /**
   * Decide whether one existing session is compatible with the next request.
   */
  isSessionReusable?: (input: {
    /**
     * Existing session being evaluated for reuse.
     */
    session: TSession;
    /**
     * Worker-family request that wants to use the session.
     */
    request: TRequest;
  }) => WorkerHostLifecycleReuseDecision;
  /**
   * Perform worker-family startup/readiness work for a fresh session.
   *
   * @remarks
   * For proxy this awaits bootstrap completion.
   * For App/build this can remain omitted because readiness is immediate after
   * spawn/wiring.
   */
  startSession?: (input: {
    /**
     * Fresh session whose startup work should begin.
     */
    session: TSession;
    /**
     * Worker-family request that created the session.
     */
    request: TRequest;
  }) => Promise<void>;
  /**
   * Diagnostic reason used when replacing one incompatible session.
   */
  replaceReason?: string;
};

/**
 * Public shutdown-definition options for one host lifecycle machine.
 *
 * @template TSession Concrete host-managed session shape.
 */
export type WorkerHostLifecycleMachineShutdownOptions<
  TSession extends WorkerHostLifecycleSessionBase
> = {
  /**
   * Send the shared shutdown request over IPC.
   */
  requestShutdown: (input: {
    /**
     * Session that should receive the shutdown request.
     */
    session: TSession;
    /**
     * Diagnostic reason recorded for the shutdown.
     */
    reason: string;
  }) => Promise<unknown>;
  /**
   * Maximum time to wait for the shutdown acknowledgement.
   */
  acknowledgementTimeoutMs: number;
  /**
   * Optional maximum time to wait for full process termination after the
   * shutdown acknowledgement.
   */
  terminationTimeoutMs?: number;
  /**
   * Error message surfaced when acknowledged shutdown still fails to
   * terminate in time.
   */
  terminationTimeoutErrorMessage?: string;
  /**
   * Optional worker-family force-close hook for extra diagnostics.
   *
   * @remarks
   * When omitted the machine uses the shared low-level force-close helper.
   */
  forceCloseSession?: (input: {
    /**
     * Active worker-session registry.
     */
    workerSessions: WorkerSessionRegistry<TSession>;
    /**
     * Session being force-closed.
     */
    session: TSession;
    /**
     * Diagnostic force-close reason.
     */
    reason: string;
  }) => void;
};

/**
 * Public lifecycle-machine creation options.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
export type CreateWorkerHostLifecycleMachineOptions<
  TResponse,
  TSession extends WorkerHostLifecycleSession<TResponse>,
  TRequest
> = {
  /**
   * Human-readable worker label used in shared error messages.
   */
  workerLabel: string;
  /**
   * Public session-definition options.
   */
  session: WorkerHostLifecycleMachineSessionOptions<TSession, TRequest>;
  /**
   * Public shutdown-definition options.
   */
  shutdown: WorkerHostLifecycleMachineShutdownOptions<TSession>;
};

/**
 * Shared host-lifecycle machine contract used by worker-family wrappers.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
export type WorkerHostLifecycleMachine<
  TResponse,
  TSession extends WorkerHostLifecycleSession<TResponse>,
  TRequest
> = {
  /**
   * Resolve, reuse, or replace one host-managed worker session.
   *
   * @param input Session-resolution input.
   * @param input.workerSessions Active worker-session registry.
   * @param input.request Worker-family request that determines compatibility.
   * @returns Ready host-managed session for the request.
   */
  resolveSession: (input: {
    workerSessions: WorkerSessionRegistry<TSession>;
    request: TRequest;
  }) => Promise<TSession>;
  /**
   * Gracefully shut down one host-managed session.
   *
   * @param input Shutdown input.
   * @param input.workerSessions Active worker-session registry.
   * @param input.session Session being shut down.
   * @param input.reason Diagnostic reason recorded for the shutdown.
   * @returns `void` after shutdown or forced close has fully terminated.
   */
  shutdownSession: (input: {
    workerSessions: WorkerSessionRegistry<TSession>;
    session: TSession;
    reason: string;
  }) => Promise<void>;
  /**
   * Observe full process termination for one host-managed session.
   *
   * @param input Termination-observation input.
   * @param input.workerSessions Active worker-session registry.
   * @param input.session Session whose child process has terminated.
   * @param input.rejectionError Optional process-exit error surfaced to pending
   * callers.
   * @returns `void` after the session has been finalized.
   */
  observeSessionTermination: (input: {
    workerSessions: WorkerSessionRegistry<TSession>;
    session: TSession;
    rejectionError?: Error;
  }) => void;
};
