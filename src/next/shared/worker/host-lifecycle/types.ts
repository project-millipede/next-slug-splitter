import type { IfStrictExtends, NoPayload } from '../types';
import type {
  WorkerSession,
  WorkerSessionBase
} from '../host/session-lifecycle';

/**
 * Shared host-lifecycle session phases.
 *
 * @remarks
 * These phases model the parent-process view of one long-lived worker
 * session:
 * - `starting`: the child exists and startup/readiness work is still running
 * - `ready`: the session can accept normal business requests
 * - `shutting-down`: graceful shutdown or replacement has started
 * - `failed`: startup or later lifecycle work failed before full close
 * - `closed`: the session has fully terminated and cannot be reused
 */
export type WorkerHostLifecyclePhase =
  | 'starting'
  | 'ready'
  | 'shutting-down'
  | 'failed'
  | 'closed';

/**
 * Backwards-compatible alias for the shared host lifecycle phase type.
 *
 * @deprecated Use {@link WorkerHostLifecyclePhase} instead.
 */
export type WorkerHostSessionPhase = WorkerHostLifecyclePhase;

/**
 * Strategy A for host lifecycle events: omit the payload property entirely.
 */
type HostLifecycleEventWithoutPayloadProps = {};

/**
 * Strategy B for host lifecycle events: include the structured payload.
 *
 * @template TPayload Structured payload for one host lifecycle event.
 */
type HostLifecycleEventWithPayloadProps<TPayload> = {
  /**
   * Structured payload carried by the internal lifecycle event.
   */
  payload: TPayload;
};

/**
 * Conditional payload wrapper used by internal host lifecycle events.
 *
 * @template TPayload Structured payload for one host lifecycle event.
 */
type WorkerHostLifecycleEventPayload<TPayload> = IfStrictExtends<
  TPayload,
  NoPayload,
  HostLifecycleEventWithoutPayloadProps,
  HostLifecycleEventWithPayloadProps<TPayload>
>;

/**
 * Internal host lifecycle event action processed by the shared host FSM.
 *
 * @template TSubject Discriminating lifecycle-event subject.
 * @template TPayload Structured payload carried by the event.
 *
 * @remarks
 * These events are parent-process orchestration signals only:
 * - they are not worker IPC requests
 * - they are not worker IPC responses
 * - they intentionally do not carry `requestId`
 */
export type WorkerHostLifecycleEvent<
  TSubject extends string,
  TPayload = NoPayload
> = {
  /**
   * Discriminating lifecycle-event subject routed by the shared host
   * dispatcher.
   */
  subject: TSubject;
} & WorkerHostLifecycleEventPayload<TPayload>;

/**
 * Minimal host lifecycle event shape used by the shared dispatcher.
 */
export type WorkerAnyHostLifecycleEvent = {
  /**
   * Discriminating lifecycle-event subject.
   */
  subject: string;
};

/**
 * Shared non-generic host-managed session state extended with lifecycle data.
 *
 * @remarks
 * This base shape contains only lifecycle fields that do not depend on the
 * worker-family response union. Response-typed pending-request tracking stays
 * layered on top by {@link WorkerHostLifecycleSession}.
 */
export type WorkerHostLifecycleSessionBase = WorkerSessionBase & {
  /**
   * Current parent-process lifecycle phase for the session.
   */
  phase: WorkerHostLifecyclePhase;
  /**
   * Shared readiness promise for the session.
   *
   * @remarks
   * Compatible callers that observe the same session while it is still
   * `starting` await this promise instead of spawning another session.
   */
  readyPromise: Promise<void>;
  /**
   * Most recent lifecycle failure observed for the session.
   */
  failureError: Error | null;
};

/**
 * Shared host-managed session shape extended with lifecycle state.
 *
 * @template TResponse Successful worker response union carried by the session.
 * Aspects of `TResponse` here:
 * - it is inherited from {@link WorkerSession}
 * - it still describes the successful response type carried by the stored
 *   `resolve(...)` callback in `pendingRequests`
 * - some lifecycle helpers still thread `TResponse` through their signatures
 *   even when they operate only on lifecycle state and rejection/finalization
 *   paths and do not inspect any successful response value from those stored
 *   pending requests
 */
export type WorkerHostLifecycleSession<TResponse> =
  WorkerHostLifecycleSessionBase & WorkerSession<TResponse>;
