import {
  getWorkerHostGlobalState,
  type WorkerHostGlobalState,
  type WorkerHostProcessShutdownState,
  type WorkerHostProtocolState
} from '../../../shared/worker/host/global-state';

import type { AppPageDataWorkerSession } from './session-lifecycle';

export type AppPageDataWorkerClientState = {
  workerSessions: Map<string, AppPageDataWorkerSession>;
};

export type AppPageDataWorkerProtocolState = WorkerHostProtocolState;

export type AppPageDataWorkerProcessShutdownState =
  WorkerHostProcessShutdownState;

export type AppPageDataWorkerHostGlobalState =
  WorkerHostGlobalState<AppPageDataWorkerClientState>;

const APP_PAGE_DATA_WORKER_HOST_GLOBAL_STATE_KEY =
  'next-slug-splitter.app-page-data-worker-host-global-state';

/**
 * Create the mutable client state bucket stored in process-global host state.
 *
 * @returns Fresh client state for the App page-data worker host.
 */
const createAppPageDataWorkerClientState =
  (): AppPageDataWorkerClientState => ({
    workerSessions: new Map()
  });

/**
 * Read or initialize the process-global App page-data worker host state.
 *
 * @returns Shared host state used by every caller in the current process.
 */
export const getAppPageDataWorkerHostGlobalState =
  (): AppPageDataWorkerHostGlobalState =>
    getWorkerHostGlobalState(
      APP_PAGE_DATA_WORKER_HOST_GLOBAL_STATE_KEY,
      createAppPageDataWorkerClientState
    );
