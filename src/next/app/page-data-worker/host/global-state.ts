import {
  getSharedWorkerHostGlobalState,
  type SharedWorkerHostGlobalState,
  type SharedWorkerHostProcessShutdownState,
  type SharedWorkerHostProtocolState
} from '../../../shared/worker/host/global-state';

import type { AppPageDataWorkerSession } from './session-lifecycle';

export type AppPageDataWorkerClientState = {
  workerSessions: Map<string, AppPageDataWorkerSession>;
};

export type AppPageDataWorkerProtocolState = SharedWorkerHostProtocolState;

export type AppPageDataWorkerProcessShutdownState =
  SharedWorkerHostProcessShutdownState;

export type AppPageDataWorkerHostGlobalState =
  SharedWorkerHostGlobalState<AppPageDataWorkerClientState>;

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
    getSharedWorkerHostGlobalState(
      APP_PAGE_DATA_WORKER_HOST_GLOBAL_STATE_KEY,
      createAppPageDataWorkerClientState
    );
