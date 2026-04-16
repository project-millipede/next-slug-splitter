import {
  sendSharedWorkerRequest,
  type SharedWorkerPendingRequest
} from '../../../shared/worker/host/protocol';

import type { AppPageDataWorkerSession } from './session-lifecycle';
import type {
  AppPageDataWorkerRequest,
  AppPageDataWorkerResponse,
  AppPageDataWorkerExchangeResponse
} from '../types';

export type AppPageDataWorkerPendingRequest =
  SharedWorkerPendingRequest<AppPageDataWorkerResponse>;

/**
 * Send one typed request to the App page-data worker.
 *
 * @template TRequest Concrete App page-data worker request variant.
 * @param session Live worker session used for the request.
 * @param request Worker request payload.
 * @returns A promise that resolves with the response paired to the request
 * variant.
 */
export const sendAppPageDataWorkerRequest = <
  TRequest extends AppPageDataWorkerRequest
>(
  session: AppPageDataWorkerSession,
  request: TRequest
): Promise<AppPageDataWorkerExchangeResponse<TRequest>> =>
  sendSharedWorkerRequest<
    TRequest,
    AppPageDataWorkerExchangeResponse<TRequest>,
    AppPageDataWorkerSession
  >(session, request, {
    closedSessionErrorMessage:
      'next-slug-splitter App page-data worker session is closed.',
    missingIpcSendErrorMessage:
      'next-slug-splitter App page-data worker IPC is unavailable.'
  });
