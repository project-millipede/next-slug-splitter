import type {
  RouteHandlerProxyWorkerBootstrapResponse,
  RouteHandlerProxyWorkerRequest,
  RouteHandlerProxyWorkerResponse,
  RouteHandlerProxyWorkerShutdownResponse
} from '../types';
import { getRouteHandlerProxyWorkerHostGlobalState } from './global-state';
import type { RouteHandlerProxyWorkerSession } from './session-lifecycle';

/**
 * Host-side IPC protocol helpers for the dedicated proxy worker.
 *
 * @remarks
 * This module owns only request/response transport mechanics:
 * - generate stable request ids for IPC correlation
 * - register and resolve pending host-side request promises
 * - surface worker-exit failures consistently
 * - reset protocol-local sequencing during explicit client cleanup
 *
 * Worker process lifecycle and session ownership intentionally live in
 * `session-lifecycle.ts`.
 */
export type RouteHandlerProxyWorkerPendingRequest = {
  resolve: (
    response:
      | RouteHandlerProxyWorkerBootstrapResponse
      | RouteHandlerProxyWorkerShutdownResponse
      | RouteHandlerProxyWorkerResponse
  ) => void;
  reject: (error: Error) => void;
};

/**
 * Shared host-side IPC protocol state for the current parent process.
 */
const routeHandlerProxyWorkerProtocolState =
  getRouteHandlerProxyWorkerHostGlobalState().protocol;

/**
 * Create one unique host-side request id for worker IPC correlation.
 *
 * @returns Stable request id string for one worker message.
 */
export const createRouteHandlerProxyWorkerRequestId = (): string =>
  `route-handler-proxy-worker-request-${String(
    ++routeHandlerProxyWorkerProtocolState.requestSequence
  )}`;

/**
 * Reset host-side worker protocol state that should not survive explicit
 * client-session clearing.
 *
 * @returns `void` after the request id sequence has been reset.
 */
export const resetRouteHandlerProxyWorkerProtocolState = (): void => {
  routeHandlerProxyWorkerProtocolState.requestSequence = 0;
};

/**
 * Reject every still-pending request on one worker session.
 *
 * @param session - Worker session whose pending requests should fail.
 * @param error - Shared error surfaced to callers.
 * @returns `void` after every pending request has been rejected and cleared.
 */
export const rejectRouteHandlerProxyWorkerSessionPendingRequests = (
  session: RouteHandlerProxyWorkerSession,
  error: Error
): void => {
  for (const pendingRequest of session.pendingRequests.values()) {
    pendingRequest.reject(error);
  }

  session.pendingRequests.clear();
};

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
 * @returns One typed worker response.
 */
export const sendRouteHandlerProxyWorkerRequest = <
  TResponse extends
    | RouteHandlerProxyWorkerBootstrapResponse
    | RouteHandlerProxyWorkerShutdownResponse
    | RouteHandlerProxyWorkerResponse
>(
  session: RouteHandlerProxyWorkerSession,
  request: RouteHandlerProxyWorkerRequest
): Promise<TResponse> =>
  new Promise((resolve, reject) => {
    if (session.closed) {
      reject(new Error('next-slug-splitter proxy worker session is closed.'));
      return;
    }

    if (typeof session.child.send !== 'function') {
      reject(new Error('next-slug-splitter proxy worker IPC is unavailable.'));
      return;
    }

    session.pendingRequests.set(request.requestId, {
      resolve: response => {
        resolve(response as TResponse);
      },
      reject
    });

    session.child.send(request, error => {
      if (error == null) {
        return;
      }

      session.pendingRequests.delete(request.requestId);
      reject(error);
    });
  });

/**
 * Build the error surfaced when the worker process exits unexpectedly.
 *
 * @param exitCode - Process exit code reported by Node.
 * @param stderrChunks - Buffered stderr output collected for the session.
 * @returns Error object describing the worker exit.
 */
export const createRouteHandlerProxyWorkerExitError = (
  exitCode: number | null,
  stderrChunks: Array<Buffer>
): Error =>
  new Error(
    `next-slug-splitter proxy worker exited with code ${String(
      exitCode
    )}: ${Buffer.concat(stderrChunks).toString('utf8')}`
  );
