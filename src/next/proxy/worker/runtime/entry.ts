import { installSharedWorkerRuntimeRequestLoop } from '../../../shared/worker/runtime/entry';
import { debugRouteHandlerProxyWorker } from '../debug-log';
import { createRouteHandlerProxyWorkerRuntimeMachine } from './machine';

import type { RouteHandlerProxyWorkerRequest } from '../types';

/**
 * Runtime entrypoint for the dedicated proxy worker process.
 *
 * @remarks
 * This file intentionally stays thin:
 * - create the proxy-worker runtime machine
 * - log per-request diagnostics that belong at the process boundary
 * - install the shared IPC request loop
 *
 * The runtime machine owns lifecycle transitions and shared shutdown
 * semantics. Proxy-specific bootstrap and lazy-miss behavior live in
 * `machine.ts` and its lower-level runtime helpers.
 */

/**
 * Run the persistent proxy worker session.
 *
 * @returns A promise that resolves after the request loop has been installed.
 */
const main = async (): Promise<void> => {
  const runtimeMachine = createRouteHandlerProxyWorkerRuntimeMachine();

  installSharedWorkerRuntimeRequestLoop<RouteHandlerProxyWorkerRequest>({
    workerLabel: 'proxy worker',
    handleRequest: async request => {
      debugRouteHandlerProxyWorker('request:start', {
        subject: request.subject,
        requestId: request.requestId,
        pathname:
          request.subject === 'resolve-lazy-miss'
            ? request.payload.pathname
            : undefined,
        cwd: process.cwd(),
        configPath: process.env.SLUG_SPLITTER_CONFIG_PATH,
        configRootDir: process.env.SLUG_SPLITTER_CONFIG_ROOT_DIR
      });

      await runtimeMachine.handleRequest(request);
    }
  });
};

void main();
