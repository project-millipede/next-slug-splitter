import { sendWorkerRequest } from '../../../shared/worker/host/protocol';

import type {
  RouteHandlerProxyWorkerRequest,
  RouteHandlerProxyWorkerExchangeResponse
} from '../types';
import type { RouteHandlerProxyWorkerSession } from './session-lifecycle';

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
  sendWorkerRequest<
    TRequest,
    RouteHandlerProxyWorkerExchangeResponse<TRequest>,
    RouteHandlerProxyWorkerSession
  >(session, request, {
    closedSessionErrorMessage:
      'next-slug-splitter proxy worker session is closed.',
    missingIpcSendErrorMessage:
      'next-slug-splitter proxy worker IPC is unavailable.'
  });
