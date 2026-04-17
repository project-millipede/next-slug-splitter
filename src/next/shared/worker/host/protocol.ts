import type { ChildProcess, Serializable } from 'node:child_process';

import type { WorkerHostProtocolState } from './global-state';
import type {
  WorkerAnyRequestAction,
  WorkerDeferredSettler,
  WorkerResponseEnvelope
} from '../types';

/**
 * Shared host-side IPC protocol helpers for long-lived worker sessions.
 *
 * @remarks
 * This module owns only request/response transport mechanics:
 * - generate stable request ids for IPC correlation
 * - register and resolve pending host-side request promises
 * - route response envelopes back to the owning pending request
 * - surface worker-exit failures consistently
 * - reset protocol-local sequencing during explicit client cleanup
 *
 * Worker process lifecycle and worker-family semantics intentionally stay out of
 * this layer.
 *
 * The shared action protocol is:
 * - requests carry `requestId` plus `subject`
 * - successful responses carry `subject`
 * - business data travels under `payload`
 */

/**
 * One pending host-side request awaiting a worker response.
 */
export type WorkerPendingRequest<TResponse> = WorkerDeferredSettler<TResponse>;

/**
 * Minimal host-side session contract required by the shared protocol helpers.
 */
export type WorkerProtocolSession<TResponse> = {
  closed: boolean;
  child: {
    send?: ChildProcess['send'];
  };
  pendingRequests: Map<string, WorkerPendingRequest<TResponse>>;
};

/**
 * Worker-family-specific error messages used while sending one IPC request.
 *
 * @remarks
 * These messages map directly to the host-side guard conditions checked before
 * a request is written into the child process:
 * - `closedSessionErrorMessage` is used when `session.closed` is already true
 * - `missingIpcSendErrorMessage` is used when the child no longer exposes a
 *   usable IPC `send(...)` function
 */
export type WorkerRequestSendErrorMessages = {
  /**
   * Error surfaced when the host already knows the session is closed.
   */
  closedSessionErrorMessage: string;
  /**
   * Error surfaced when the child process no longer exposes the IPC send
   * capability required for request transport.
   */
  missingIpcSendErrorMessage: string;
};

/**
 * Create one unique host-side request id for worker IPC correlation.
 *
 * @param protocolState - Shared host-side protocol state.
 * @param requestIdPrefix - Stable worker-family request id prefix.
 * @returns Stable request id string for one worker message.
 */
export const createWorkerRequestId = (
  protocolState: WorkerHostProtocolState,
  requestIdPrefix: string
): string => `${requestIdPrefix}-${String(++protocolState.requestSequence)}`;

/**
 * Reset host-side worker protocol state that should not survive explicit
 * client-session clearing.
 *
 * @param protocolState - Shared host-side protocol state.
 * @returns `void` after the request id sequence has been reset.
 */
export const resetWorkerProtocolState = (
  protocolState: WorkerHostProtocolState
): void => {
  protocolState.requestSequence = 0;
};

/**
 * Reject every still-pending request on one worker session.
 *
 * @param session - Worker session whose pending requests should fail.
 * @param error - Shared error surfaced to callers.
 * @returns `void` after every pending request has been rejected and cleared.
 */
export const rejectWorkerSessionPendingRequests = <TResponse>(
  session: Pick<WorkerProtocolSession<TResponse>, 'pendingRequests'>,
  error: Error
): void => {
  for (const pendingRequest of session.pendingRequests.values()) {
    pendingRequest.reject(error);
  }

  session.pendingRequests.clear();
};

/**
 * Register one in-flight pending request on the shared worker session.
 *
 * @template TResponse Successful worker response union tracked by the session.
 * @param session Worker session that owns the pending request registry.
 * @param requestId Stable request identifier used for response correlation.
 * @param pendingRequest Promise settlement callbacks for the in-flight request.
 * @returns `void` after the pending request has been stored by request id.
 */
const registerWorkerPendingRequest = <TResponse>(
  session: Pick<WorkerProtocolSession<TResponse>, 'pendingRequests'>,
  requestId: string,
  pendingRequest: WorkerPendingRequest<TResponse>
): void => {
  session.pendingRequests.set(requestId, pendingRequest);
};

/**
 * Unregister one in-flight pending request from the shared worker session.
 *
 * @template TResponse Successful worker response union tracked by the session.
 * @param session Worker session that owns the pending request registry.
 * @param requestId Stable request identifier used for response correlation.
 * @returns The removed pending request when one was registered for the given
 * request id.
 */
const unregisterWorkerPendingRequest = <TResponse>(
  session: Pick<WorkerProtocolSession<TResponse>, 'pendingRequests'>,
  requestId: string
): WorkerPendingRequest<TResponse> | undefined => {
  const pendingRequest = session.pendingRequests.get(requestId);

  if (pendingRequest == null) {
    return undefined;
  }

  session.pendingRequests.delete(requestId);

  return pendingRequest;
};

/**
 * Complete one pending host-side request from a validated worker response
 * envelope.
 *
 * @template TResponse Successful worker response union tracked by the session.
 * @param pendingRequest Pending request that was waiting for the response.
 * @param envelope Validated shared worker response envelope.
 * @returns `void` after the pending request has been resolved or rejected.
 */
const completeWorkerPendingRequestFromEnvelope = <TResponse>(
  pendingRequest: WorkerPendingRequest<TResponse>,
  envelope: WorkerResponseEnvelope<TResponse>
): void => {
  if (envelope.ok) {
    pendingRequest.resolve(envelope.response);
    return;
  }

  pendingRequest.reject(new Error(envelope.error.message));
};

/**
 * Route one trusted worker IPC response envelope back to its pending
 * host-side request.
 *
 * @param session - Worker session that owns the pending requests.
 * @param envelope - Trusted shared worker response envelope.
 * @returns `void` after the matching pending request has been resolved or
 * rejected when applicable.
 */
export const resolveWorkerResponseEnvelope = <TResponse>(
  session: WorkerProtocolSession<TResponse>,
  envelope: WorkerResponseEnvelope<TResponse>
): void => {
  // 1. Claim the matching pending request by request id. Unknown or already
  //    settled ids are ignored.
  const pendingRequest = unregisterWorkerPendingRequest(
    session,
    envelope.requestId
  );

  if (pendingRequest == null) {
    return;
  }

  // 2. Complete the claimed pending request from the trusted envelope.
  completeWorkerPendingRequestFromEnvelope(pendingRequest, envelope);
};

/**
 * Assert that one shared worker session is still open for request sending.
 *
 * @template TResponse Successful worker response union tracked by the session.
 * @param session Worker session whose host-side lifecycle state is being
 * checked.
 * @param closedSessionErrorMessage Error surfaced when the session has already
 * been marked closed.
 * @returns `void` when the session is still open.
 */
const assertWorkerSessionOpen = <TResponse>(
  session: Pick<WorkerProtocolSession<TResponse>, 'closed'>,
  closedSessionErrorMessage: string
): void => {
  if (session.closed) {
    throw new Error(closedSessionErrorMessage);
  }
};

/**
 * Assert that one shared worker session still exposes the IPC send capability
 * required for request transport.
 *
 * @template TResponse Successful worker response union tracked by the session.
 * @param session Worker session whose child-process IPC capability is being
 * checked.
 * @param missingIpcSendErrorMessage Error surfaced when the child no longer
 * exposes a usable `send(...)` function.
 * @returns `void` when the child still supports IPC request sending.
 */
function assertWorkerIpcSendAvailable<TResponse>(
  session: WorkerProtocolSession<TResponse>,
  missingIpcSendErrorMessage: string
): asserts session is WorkerProtocolSession<TResponse> & {
  child: {
    send: NonNullable<ChildProcess['send']>;
  };
} {
  if (typeof session.child.send !== 'function') {
    throw new Error(missingIpcSendErrorMessage);
  }
}

/**
 * Write one request into the persistent worker session.
 *
 * @remarks
 * Request-send aspects:
 * - Transport: requests travel over the child IPC channel, not stdin.
 * - Correlation: pending promises are keyed by request id until one matching
 *   response arrives.
 * - Failure mode: a missing IPC channel is treated as a session-level
 *   contract violation.
 *
 * @param session - Worker session that should receive the request.
 * @param request - Serialized worker request payload.
 * @param options - Worker-family-specific transport messages.
 * @returns One typed worker response.
 */
export const sendWorkerRequest = <
  TRequest extends Serializable & WorkerAnyRequestAction,
  TResponse,
  TSession extends WorkerProtocolSession<TResponse>
>(
  session: TSession,
  request: TRequest,
  {
    closedSessionErrorMessage,
    missingIpcSendErrorMessage
  }: WorkerRequestSendErrorMessages
): Promise<TResponse> =>
  new Promise((resolve, reject) => {
    try {
      // 1. Fail fast when the host already knows this session can no longer
      //    accept requests.
      assertWorkerSessionOpen(session, closedSessionErrorMessage);
      // 2. Verify that the child process still exposes the IPC send capability
      //    required for worker messaging.
      assertWorkerIpcSendAvailable(session, missingIpcSendErrorMessage);
    } catch (error) {
      reject(error);
      return;
    }

    // 3. Register the pending request before sending so the matching response
    //    envelope can resolve this promise by request id.
    registerWorkerPendingRequest(session, request.requestId, {
      resolve,
      reject
    });

    // 4. Send the serialized request over the child IPC channel.
    //    Transport errors happen before any worker response exists, so remove
    //    the pending entry and reject immediately.
    session.child.send(request, error => {
      if (error == null) {
        return;
      }

      unregisterWorkerPendingRequest(session, request.requestId);
      reject(error);
    });
  });

/**
 * Build the error surfaced when the worker process exits unexpectedly.
 *
 * @param workerLabel - Human-readable worker label used in the error message.
 * @param exitCode - Process exit code reported by Node.
 * @param stderrChunks - Buffered stderr output collected for the session.
 * @returns Error object describing the worker exit.
 */
export const createWorkerExitError = ({
  workerLabel,
  exitCode,
  stderrChunks
}: {
  workerLabel: string;
  exitCode: number | null;
  stderrChunks: Array<Buffer>;
}): Error => {
  const bufferedStderrText = Buffer.concat(stderrChunks).toString('utf8');

  return new Error(
    `next-slug-splitter ${workerLabel} exited with code ${exitCode}: ${bufferedStderrText}`
  );
};
