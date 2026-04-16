import {
  sendSharedWorkerRequest,
  type SharedWorkerPendingRequest
} from '../../../shared/worker/host/protocol';

import type {
  RouteHandlerProxyWorkerBootstrapResponse,
  RouteHandlerProxyWorkerRequest,
  RouteHandlerProxyWorkerResponse,
  RouteHandlerProxyWorkerExchangeResponse,
  RouteHandlerProxyWorkerShutdownResponse
} from '../types';
import type { RouteHandlerProxyWorkerSession } from './session-lifecycle';

/**
 * Host-side IPC protocol helpers for the dedicated proxy worker.
 *
 * @remarks
 * This wrapper keeps the proxy worker's public request/response types and
 * worker-family-specific error messages while delegating the shared transport
 * mechanics to `src/next/shared/worker/host/protocol.ts`.
 */
export type RouteHandlerProxyWorkerPendingRequest = SharedWorkerPendingRequest<
  | RouteHandlerProxyWorkerBootstrapResponse
  | RouteHandlerProxyWorkerShutdownResponse
  | RouteHandlerProxyWorkerResponse
>;

/**
 * Write one request into the persistent worker session.
 *
 * @template TRequest Concrete proxy worker request variant.
 * @param session - Worker session that should receive the request.
 * @param request - Serialized worker request payload.
 * @returns The response paired with the request variant.
 */
export const sendRouteHandlerProxyWorkerRequest = <
  TRequest extends RouteHandlerProxyWorkerRequest
>(
  session: RouteHandlerProxyWorkerSession,
  request: TRequest
): Promise<RouteHandlerProxyWorkerExchangeResponse<TRequest>> =>
  sendSharedWorkerRequest<
    TRequest,
    RouteHandlerProxyWorkerExchangeResponse<TRequest>,
    RouteHandlerProxyWorkerSession
  >(session, request, {
    closedSessionErrorMessage:
      'next-slug-splitter proxy worker session is closed.',
    missingIpcSendErrorMessage:
      'next-slug-splitter proxy worker IPC is unavailable.'
  });
