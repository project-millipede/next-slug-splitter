import { debugRouteHandlerProxy } from '../../observability/debug-log';
import { installSharedWorkerProcessShutdownHooks } from '../../../shared/worker/host/process-shutdown';
import { getRouteHandlerProxyWorkerHostGlobalState } from './global-state';

/**
 * Process-lifecycle hooks for graceful proxy-worker cleanup.
 *
 * @remarks
 * This host-side wrapper translates direct process shutdown into the existing
 * worker-session shutdown protocol while delegating the shared signal-hook
 * mechanics to `src/next/shared/worker/host/process-shutdown.ts`.
 */
type RouteHandlerProxyWorkerProcessShutdownHooks = {
  /**
   * Read the current number of active worker sessions owned by the parent.
   */
  getActiveSessionCount: () => number;
  /**
   * Gracefully clear all parent-owned worker sessions.
   */
  clearWorkerSessions: () => Promise<void>;
};

/**
 * Shared process-shutdown state for the current parent process.
 */
const routeHandlerProxyWorkerProcessShutdownState =
  getRouteHandlerProxyWorkerHostGlobalState().processShutdown;

/**
 * Install one-time process shutdown hooks for graceful proxy-worker cleanup.
 *
 * @param hooks - Parent-owned worker-session callbacks.
 * @returns `void` after the relevant signal handlers have been installed.
 */
export const installRouteHandlerProxyWorkerProcessShutdownHooks = (
  hooks: RouteHandlerProxyWorkerProcessShutdownHooks
): void => {
  installSharedWorkerProcessShutdownHooks({
    processShutdownState: routeHandlerProxyWorkerProcessShutdownState,
    hooks,
    exitAfterSignalCleanup: true,
    onShutdownStart: ({ signal, sessionCount }) => {
      debugRouteHandlerProxy('lazy-worker:process-shutdown-start', {
        signal,
        sessionCount
      });
    },
    onShutdownComplete: ({ signal, exitCode }) => {
      debugRouteHandlerProxy('lazy-worker:process-shutdown-complete', {
        signal,
        exitCode
      });
    },
    onShutdownError: ({ signal, exitCode, error }) => {
      debugRouteHandlerProxy('lazy-worker:process-shutdown-error', {
        signal,
        exitCode,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
};
