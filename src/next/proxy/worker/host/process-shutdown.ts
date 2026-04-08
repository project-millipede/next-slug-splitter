import { debugRouteHandlerProxy } from '../../observability/debug-log';
import { getRouteHandlerProxyWorkerHostGlobalState } from './global-state';

/**
 * Process-lifecycle hooks for graceful proxy-worker cleanup.
 *
 * @remarks
 * This host-side helper translates direct process shutdown into the existing
 * worker-session shutdown protocol:
 * - register one-time shutdown hooks on first worker use
 * - keep shutdown handling idempotent across repeated signals
 * - map process signals onto conventional exit codes
 * - run host-owned worker cleanup before the process exits
 *
 * It intentionally does not own worker-session state itself. The host client
 * injects the session-clearing callbacks so lifecycle translation stays
 * separate from worker-session bookkeeping.
 */
const ROUTE_HANDLER_PROXY_SIGINT_EXIT_CODE = 130;
const ROUTE_HANDLER_PROXY_SIGTERM_EXIT_CODE = 143;

type RouteHandlerProxyWorkerProcessShutdownSignal =
  | 'SIGINT'
  | 'SIGTERM'
  | 'SIGBREAK';

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
 * Resolve the process exit code used after graceful worker cleanup for one
 * shutdown signal.
 *
 * @param signal - Process signal that initiated shutdown.
 * @returns Conventional process exit code for the given signal.
 */
const resolveRouteHandlerProxyWorkerProcessShutdownExitCode = (
  signal: RouteHandlerProxyWorkerProcessShutdownSignal
): number => {
  if (signal === 'SIGTERM') {
    return ROUTE_HANDLER_PROXY_SIGTERM_EXIT_CODE;
  }

  return ROUTE_HANDLER_PROXY_SIGINT_EXIT_CODE;
};

/**
 * Run graceful proxy-worker cleanup for one parent-process shutdown signal.
 *
 * @remarks
 * Direct user shutdown is the primary requirement here. When a user stops
 * `next dev` with `Ctrl+C`, the parent process should translate that into the
 * existing worker shutdown protocol so RAM-backed lazy cache state can flush to
 * disk before the process exits normally.
 *
 * This hook remains intentionally scoped to graceful shutdown only:
 * - it improves controlled user/process-manager exits
 * - it does not promise durability for hard crashes or forced kills
 *
 * @param signal - Process signal that initiated shutdown.
 * @param hooks - Parent-owned worker-session callbacks.
 * @returns `void` after worker cleanup has completed and the parent process is
 * ready to exit.
 */
const handleRouteHandlerProxyWorkerProcessShutdownSignal = async (
  signal: RouteHandlerProxyWorkerProcessShutdownSignal,
  hooks: RouteHandlerProxyWorkerProcessShutdownHooks
): Promise<void> => {
  if (routeHandlerProxyWorkerProcessShutdownState.shutdownPromise != null) {
    await routeHandlerProxyWorkerProcessShutdownState.shutdownPromise;
    return;
  }

  routeHandlerProxyWorkerProcessShutdownState.shutdownPromise = (async () => {
    const exitCode =
      resolveRouteHandlerProxyWorkerProcessShutdownExitCode(signal);

    debugRouteHandlerProxy('lazy-worker:process-shutdown-start', {
      signal,
      sessionCount: hooks.getActiveSessionCount()
    });

    try {
      await hooks.clearWorkerSessions();
      debugRouteHandlerProxy('lazy-worker:process-shutdown-complete', {
        signal,
        exitCode
      });
    } catch (error) {
      debugRouteHandlerProxy('lazy-worker:process-shutdown-error', {
        signal,
        exitCode,
        message: error instanceof Error ? error.message : String(error)
      });
    }

    process.exit(exitCode);
  })();

  await routeHandlerProxyWorkerProcessShutdownState.shutdownPromise;
};

/**
 * Install one-time process shutdown hooks for graceful proxy-worker cleanup.
 *
 * @remarks
 * Separation of concerns:
 * - this module owns only process-lifecycle translation
 * - the host-side worker client still owns worker-session state and shutdown
 *   protocol details
 *
 * Hook coverage:
 * - `SIGINT`: primary direct-user shutdown path for `Ctrl+C`
 * - `SIGTERM`: process-manager initiated graceful shutdown
 * - `SIGBREAK`: Windows `Ctrl+Break`
 *
 * Hooks are installed lazily on first worker use so unrelated processes do not
 * pay any process-wide side effects before the proxy worker path is active.
 *
 * @param hooks - Parent-owned worker-session callbacks.
 * @returns `void` after the relevant signal handlers have been installed.
 */
export const installRouteHandlerProxyWorkerProcessShutdownHooks = (
  hooks: RouteHandlerProxyWorkerProcessShutdownHooks
): void => {
  if (routeHandlerProxyWorkerProcessShutdownState.hasInstalledHooks) {
    return;
  }

  routeHandlerProxyWorkerProcessShutdownState.hasInstalledHooks = true;

  process.once('SIGINT', () => {
    void handleRouteHandlerProxyWorkerProcessShutdownSignal('SIGINT', hooks);
  });
  process.once('SIGTERM', () => {
    void handleRouteHandlerProxyWorkerProcessShutdownSignal('SIGTERM', hooks);
  });

  if (process.platform === 'win32') {
    process.once('SIGBREAK', () => {
      void handleRouteHandlerProxyWorkerProcessShutdownSignal(
        'SIGBREAK',
        hooks
      );
    });
  }
};
