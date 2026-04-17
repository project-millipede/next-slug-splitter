import type { WorkerSessionRegistry } from '../../../host/session-lifecycle';

import type {
  WorkerHostLifecycleEvent,
  WorkerHostLifecycleSession,
  WorkerHostLifecycleSessionBase
} from '../../types';

import type { WorkerHostLifecycleReuseDecision } from '../types';

/**
 * Internal host-lifecycle machine implementation contracts.
 *
 * @remarks
 * This module is intentionally separate from the public machine types so the
 * worker-family contract does not also expose:
 * - the internal event model
 * - the grouped session and shutdown engine context
 * - the cross-cutting event processor used by the shared machine engine
 */

/**
 * Internal lifecycle event fired after startup/readiness has completed.
 *
 * @template TSession Concrete host-managed session shape.
 */
type SessionReadyEvent<TSession> = WorkerHostLifecycleEvent<
  'session-ready',
  {
    session: TSession;
  }
>;

/**
 * Internal lifecycle event fired when startup/readiness fails.
 *
 * @template TSession Concrete host-managed session shape.
 */
type SessionStartFailedEvent<TSession> = WorkerHostLifecycleEvent<
  'session-start-failed',
  {
    session: TSession;
    error: Error;
  }
>;

/**
 * Internal lifecycle event fired when one existing session must be replaced.
 *
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
type ReplacementRequestedEvent<TSession, TRequest> = WorkerHostLifecycleEvent<
  'replacement-requested',
  {
    session: TSession;
    request: TRequest;
    reason: string;
  }
>;

/**
 * Internal lifecycle event fired when graceful shutdown starts.
 *
 * @template TSession Concrete host-managed session shape.
 */
type ShutdownRequestedEvent<TSession> = WorkerHostLifecycleEvent<
  'shutdown-requested',
  {
    session: TSession;
    reason: string;
  }
>;

/**
 * Internal lifecycle event fired when shutdown transport fails.
 *
 * @template TSession Concrete host-managed session shape.
 */
type ShutdownFailedEvent<TSession> = WorkerHostLifecycleEvent<
  'shutdown-failed',
  {
    session: TSession;
    reason: string;
    error: Error;
  }
>;

/**
 * Internal lifecycle event fired before the host forces the child closed.
 *
 * @template TSession Concrete host-managed session shape.
 */
type ForceCloseRequestedEvent<TSession> = WorkerHostLifecycleEvent<
  'force-close-requested',
  {
    session: TSession;
    reason: string;
  }
>;

/**
 * Internal lifecycle event fired after process termination has been observed.
 *
 * @template TSession Concrete host-managed session shape.
 */
type TerminationObservedEvent<TSession> = WorkerHostLifecycleEvent<
  'termination-observed',
  {
    session: TSession;
    rejectionError?: Error;
  }
>;

/**
 * Internal lifecycle-event union for transitions that enter the engine from an
 * outside call chain.
 *
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
export type WorkerHostLifecycleMachineBoundaryEvent<TSession, TRequest> =
  | ReplacementRequestedEvent<TSession, TRequest>
  | ShutdownRequestedEvent<TSession>
  | TerminationObservedEvent<TSession>;

/**
 * Internal lifecycle-event union for transitions derived entirely inside the
 * shared engine.
 *
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
export type WorkerHostLifecycleMachineDerivedEvent<TSession, TRequest> =
  | SessionReadyEvent<TSession>
  | SessionStartFailedEvent<TSession>
  | ShutdownFailedEvent<TSession>
  | ForceCloseRequestedEvent<TSession>;

/**
 * Full internal lifecycle-event union processed by the shared host FSM.
 *
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
export type WorkerHostLifecycleMachineEvent<TSession, TRequest> =
  | WorkerHostLifecycleMachineBoundaryEvent<TSession, TRequest>
  | WorkerHostLifecycleMachineDerivedEvent<TSession, TRequest>;

/**
 * Dynamic dispatch context passed into one host lifecycle event handler.
 *
 * @template TSession Concrete host-managed session shape.
 */
export type WorkerHostLifecycleMachineEventDispatchContext<
  TSession extends WorkerHostLifecycleSessionBase
> = {
  /**
   * Active worker-session registry for the current event dispatch.
   */
  workerSessions: WorkerSessionRegistry<TSession>;
};

/**
 * Cross-cutting event-processor callback used by the grouped internal machine
 * context.
 *
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
export type WorkerHostLifecycleMachineEventProcessor<
  TSession extends WorkerHostLifecycleSessionBase,
  TRequest
> = (input: {
  /**
   * Dynamic dispatch context for the current event.
   */
  context: WorkerHostLifecycleMachineEventDispatchContext<TSession>;
  /**
   * Internal lifecycle event to process.
   */
  event: WorkerHostLifecycleMachineEvent<TSession, TRequest>;
}) => Promise<void>;

/**
 * Shared force-close callback used by the host lifecycle machine helpers.
 *
 * @template TSession Concrete host-managed session shape.
 */
export type WorkerHostLifecycleMachineForceCloseInvoker<
  TSession extends WorkerHostLifecycleSessionBase
> = (input: {
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

/**
 * Normalized internal session context used by the shared host lifecycle
 * machine.
 *
 * @remarks
 * This group owns the session-specific rules for:
 * - locating or creating a session
 * - deciding reuse versus replacement
 * - starting a fresh session
 * - explaining why one session replaced another
 *
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
export type WorkerHostLifecycleMachineSessionContext<
  TSession extends WorkerHostLifecycleSessionBase,
  TRequest
> = {
  /**
   * Derive the stable host-side session key for one request.
   */
  createSessionKey: (request: TRequest) => string;
  /**
   * Create a fresh host-managed session.
   */
  createSession: (input: {
    /**
     * Active worker-session registry that will own the created session.
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
  isSessionReusable: (input: {
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
   * Diagnostic replacement reason used for incompatible sessions.
   */
  replaceReason: string;
};

/**
 * Normalized internal shutdown context used by the shared host lifecycle
 * machine.
 *
 * @remarks
 * This group owns the shutdown-specific rules for:
 * - sending graceful shutdown
 * - timing acknowledgement and termination waits
 * - forcing the child process closed when graceful shutdown fails
 *
 * @template TSession Concrete host-managed session shape.
 */
export type WorkerHostLifecycleMachineShutdownContext<
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
   * Optional maximum wait for full process termination after acknowledgement.
   */
  terminationTimeoutMs?: number;
  /**
   * Optional timeout surfaced when acknowledged shutdown still fails to
   * terminate in time.
   */
  terminationTimeoutErrorMessage?: string;
  /**
   * Shared force-close invoker.
   */
  invokeForceClose: WorkerHostLifecycleMachineForceCloseInvoker<TSession>;
};

/**
 * Grouped internal machine context captured by the extracted host lifecycle
 * machine helpers.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
export type WorkerHostLifecycleMachineContext<
  TResponse,
  TSession extends WorkerHostLifecycleSession<TResponse>,
  TRequest
> = {
  /**
   * Human-readable worker label used in shared error messages.
   */
  workerLabel: string;
  /**
   * Grouped session rules used by session resolution and startup flows.
   */
  session: WorkerHostLifecycleMachineSessionContext<TSession, TRequest>;
  /**
   * Grouped shutdown rules used by graceful shutdown and force-close flows.
   */
  shutdown: WorkerHostLifecycleMachineShutdownContext<TSession>;
  /**
   * Cross-cutting internal lifecycle event processor.
   */
  processEvent: WorkerHostLifecycleMachineEventProcessor<TSession, TRequest>;
};
