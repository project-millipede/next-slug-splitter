import process from 'node:process';

import { assertWorkerRuntimeIpcChannel } from './protocol';

/**
 * Shared worker-runtime entry helpers.
 *
 * @remarks
 * This module owns the process-level event loop and shutdown mechanics shared
 * by the long-lived proxy worker, App page-data worker, and build worker
 * runtimes:
 * - validate the IPC-capable runtime contract up front
 * - install the worker-process request loop
 * - ignore malformed non-object IPC payloads instead of treating them as
 *   protocol failures
 * - provide the standard shutdown exit path after the worker has acknowledged
 *   the request
 */

/**
 * Install the persistent worker-session request loop.
 *
 * @remarks
 * Session aspects:
 * - Lifecycle: the process stays alive and handles many requests.
 * - State: worker-family retained state stays outside this helper and is
 *   closed over by the request handler.
 * - Input validation: non-object IPC payloads are ignored rather than treated
 *   as protocol failures.
 *
 * @param input - Request-loop installation input.
 * @returns `void` after the process message handler has been installed.
 */
export const installWorkerRuntimeRequestLoop = <TRequest extends object>({
  workerLabel,
  handleRequest
}: {
  workerLabel: string;
  handleRequest: (request: TRequest) => Promise<void>;
}): void => {
  assertWorkerRuntimeIpcChannel(workerLabel);

  process.on('message', rawMessage => {
    if (rawMessage == null || typeof rawMessage !== 'object') {
      return;
    }

    void handleRequest(rawMessage as TRequest);
  });
};

/**
 * Disconnect the worker from the parent process and exit successfully.
 *
 * @returns `void` after the disconnect-and-exit path has been triggered.
 */
export const disconnectWorkerRuntimeProcess = (): void => {
  process.disconnect?.();
  process.exit(0);
};
