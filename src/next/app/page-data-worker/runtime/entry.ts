import { installSharedWorkerRuntimeRequestLoop } from '../../../shared/worker/runtime/entry';
import { createAppPageDataWorkerRuntimeMachine } from './machine';

import type { AppPageDataWorkerRequest } from '../types';

/**
 * Runtime entrypoint for the App page-data worker process.
 *
 * @remarks
 * This file intentionally stays thin:
 * - create the App page-data worker runtime machine
 * - install the shared IPC request loop
 * - keep process-level bootstrapping separate from App page-data semantics
 *
 * The runtime machine owns lifecycle transitions and shared shutdown
 * semantics. App-specific compilation behavior lives in `machine.ts`.
 */

/**
 * Start the App page-data worker request loop.
 *
 * @returns A promise that resolves after the runtime loop is installed.
 */
const main = async (): Promise<void> => {
  const runtimeMachine = createAppPageDataWorkerRuntimeMachine();

  installSharedWorkerRuntimeRequestLoop<AppPageDataWorkerRequest>({
    workerLabel: 'App page-data worker',
    handleRequest: runtimeMachine.handleRequest
  });
};

void main().catch(error => {
  console.error(error);
  process.exit(1);
});
