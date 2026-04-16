import process from 'node:process';

import {
  createSharedWorkerRequestId,
  resetSharedWorkerProtocolState
} from '../../../shared/worker/host/protocol';
import { installSharedWorkerProcessShutdownHooks } from '../../../shared/worker/host/process-shutdown';
import { getAppPageDataWorkerHostGlobalState } from './global-state';
import { sendAppPageDataWorkerRequest } from './protocol';
import {
  resolveAppPageDataWorkerSession,
  shutdownAppPageDataWorkerSessionGracefully,
  type AppPageDataWorkerSession
} from './session-lifecycle';

import type { JsonValue } from '../../../../utils/type-guards-json';
import type {
  AppPageDataCompileRequest,
} from '../types';

const appPageDataWorkerClientState =
  getAppPageDataWorkerHostGlobalState().client;
const appPageDataWorkerProtocolState =
  getAppPageDataWorkerHostGlobalState().protocol;
const appPageDataWorkerProcessShutdownState =
  getAppPageDataWorkerHostGlobalState().processShutdown;

const workerSessions = appPageDataWorkerClientState.workerSessions;

/**
 * Install process-wide shutdown hooks for the App page-data worker host.
 *
 * @returns `void`. Hooks are installed idempotently through shared state.
 */
const installAppPageDataWorkerProcessShutdownHooks = (): void => {
  installSharedWorkerProcessShutdownHooks({
    processShutdownState: appPageDataWorkerProcessShutdownState,
    hooks: {
      clearWorkerSessions: clearAppPageDataWorkerClientSessions
    },
    includeProcessExitHook: true
  });
};

/**
 * Close every active App page-data worker session and reset host-local state.
 *
 * @returns A promise that settles after all tracked sessions are closed.
 */
export const clearAppPageDataWorkerClientSessions = async (): Promise<void> => {
  const activeWorkerSessions = [...workerSessions.values()];

  for (const workerSession of activeWorkerSessions) {
    await shutdownAppPageDataWorkerSessionGracefully({
      workerSessions,
      session: workerSession
    });
  }

  workerSessions.clear();
  resetSharedWorkerProtocolState(appPageDataWorkerProtocolState);
  appPageDataWorkerProcessShutdownState.shutdownPromise = null;
};

/**
 * Resolve the reusable worker session for one app root.
 *
 * @param input Session lookup input.
 * @param input.rootDir Application root used to scope the worker session.
 * @returns The live worker session for the requested app root.
 */
const resolveAppPageDataWorkerClientSession = async ({
  rootDir
}: {
  rootDir: string;
}): Promise<AppPageDataWorkerSession> => {
  installAppPageDataWorkerProcessShutdownHooks();

  return await resolveAppPageDataWorkerSession({
    workerSessions,
    rootDir
  });
};

/**
 * Compile App page data through the isolated page-data worker.
 *
 * @template TInput Serializable input payload sent to the compiler worker.
 * @template TResult Serializable result payload returned by the compiler
 * worker.
 * @param input Worker invocation details.
 * @param input.targetId Stable target identifier used for diagnostics.
 * @param input.compilerModulePath Resolved runtime path to the compiler module.
 * @param input.input Serializable compiler input payload.
 * @param input.rootDir Optional application root used to scope worker reuse.
 * @returns The compiler result returned by the worker.
 */
export const compileAppPageDataWithWorker = async <
  TInput extends JsonValue,
  TResult extends JsonValue
>({
  targetId,
  compilerModulePath,
  input,
  rootDir = process.cwd()
}: {
  targetId: string;
  compilerModulePath: string;
  input: TInput;
  rootDir?: string;
}): Promise<TResult> => {
  // Session reuse is keyed by app root so repeated page renders do not spawn
  // a fresh compiler process for every route hit.
  const session = await resolveAppPageDataWorkerClientSession({
    rootDir
  });
  const request: AppPageDataCompileRequest = {
    requestId: createSharedWorkerRequestId(
      appPageDataWorkerProtocolState,
      'app-page-data-worker-request'
    ),
    subject: 'compile-page-data',
    payload: {
      targetId,
      compilerModulePath,
      input
    }
  };
  const response = await sendAppPageDataWorkerRequest(session, request);

  return response.payload.result as TResult;
};
