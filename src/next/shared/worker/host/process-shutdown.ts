import process from 'node:process';

import type { SharedWorkerHostProcessShutdownState } from './global-state';

/**
 * Shared process-lifecycle hooks for graceful worker cleanup.
 *
 * @remarks
 * Different worker families install different hook sets, but they all need the
 * same lifecycle translation primitives:
 * - register one-time shutdown hooks on first worker use
 * - keep shutdown handling idempotent across repeated signals
 * - optionally map process signals onto conventional exit codes
 * - optionally run host-owned worker cleanup before the process exits
 *
 * Worker-family wrappers still own the choice of:
 * - which signals/events they want to handle
 * - whether cleanup should force an explicit `process.exit(...)`
 * - whether they want structured lifecycle logging
 */

const SHARED_WORKER_SIGINT_EXIT_CODE = 130;
const SHARED_WORKER_SIGTERM_EXIT_CODE = 143;

export type SharedWorkerProcessShutdownSignal =
  | 'SIGINT'
  | 'SIGTERM'
  | 'SIGBREAK';

const resolveSharedWorkerProcessShutdownExitCode = (
  signal: SharedWorkerProcessShutdownSignal
): number => {
  if (signal === 'SIGTERM') {
    return SHARED_WORKER_SIGTERM_EXIT_CODE;
  }

  return SHARED_WORKER_SIGINT_EXIT_CODE;
};

type SharedWorkerProcessShutdownHooks = {
  /**
   * Gracefully clear all parent-owned worker sessions.
   */
  clearWorkerSessions: () => Promise<void>;
  /**
   * Read the current number of active worker sessions owned by the parent.
   *
   * This is optional because only some worker families log the session count.
   */
  getActiveSessionCount?: () => number;
};

type SharedWorkerProcessShutdownStartInfo = {
  /**
   * Process signal that started the graceful shutdown flow.
   */
  signal: SharedWorkerProcessShutdownSignal;
  /**
   * Number of still-active worker sessions observed when shutdown began.
   */
  sessionCount: number;
};

type SharedWorkerProcessShutdownCompleteInfo = {
  /**
   * Process signal that started the graceful shutdown flow.
   */
  signal: SharedWorkerProcessShutdownSignal;
  /**
   * Conventional process exit code paired with the shutdown signal.
   */
  exitCode: number;
};

type SharedWorkerProcessShutdownErrorInfo = {
  /**
   * Process signal that started the graceful shutdown flow.
   */
  signal: SharedWorkerProcessShutdownSignal;
  /**
   * Conventional process exit code paired with the shutdown signal.
   */
  exitCode: number;
  /**
   * Error thrown while clearing the retained worker sessions.
   */
  error: unknown;
};

type SharedWorkerProcessShutdownCallbacks = {
  /**
   * Optional callback fired once shutdown starts and the active session count
   * has been sampled.
   */
  onShutdownStart?: (
    input: SharedWorkerProcessShutdownStartInfo
  ) => void;
  /**
   * Optional callback fired after worker-session cleanup completes
   * successfully.
   */
  onShutdownComplete?: (
    input: SharedWorkerProcessShutdownCompleteInfo
  ) => void;
  /**
   * Optional callback fired when worker-session cleanup throws.
   */
  onShutdownError?: (
    input: SharedWorkerProcessShutdownErrorInfo
  ) => void;
};

type StartSharedWorkerProcessShutdownInput =
  SharedWorkerProcessShutdownCallbacks & {
    /**
     * Shared parent-process shutdown state used to keep cleanup idempotent.
     */
    processShutdownState: SharedWorkerHostProcessShutdownState;
    /**
     * Process signal currently being translated into graceful cleanup.
     */
    signal: SharedWorkerProcessShutdownSignal;
    /**
     * Worker-family hooks used to inspect and clear retained sessions.
     */
    hooks: SharedWorkerProcessShutdownHooks;
    /**
     * Whether the helper should call `process.exit(...)` after cleanup.
     */
    exitAfterCleanup: boolean;
  };

const startSharedWorkerProcessShutdown = ({
  processShutdownState,
  signal,
  hooks,
  exitAfterCleanup,
  onShutdownStart,
  onShutdownComplete,
  onShutdownError
}: StartSharedWorkerProcessShutdownInput): void => {
  if (processShutdownState.shutdownPromise != null) {
    return;
  }

  processShutdownState.shutdownPromise = (async () => {
    const exitCode = resolveSharedWorkerProcessShutdownExitCode(signal);
    const sessionCount = hooks.getActiveSessionCount?.() ?? 0;

    onShutdownStart?.({
      signal,
      sessionCount
    });

    try {
      await hooks.clearWorkerSessions();
      onShutdownComplete?.({
        signal,
        exitCode
      });
    } catch (error) {
      onShutdownError?.({
        signal,
        exitCode,
        error
      });
    }

    if (exitAfterCleanup) {
      process.exit(exitCode);
    }
  })();
};

const installSharedWorkerExitHook = ({
  processShutdownState,
  clearWorkerSessions
}: {
  processShutdownState: SharedWorkerHostProcessShutdownState;
  clearWorkerSessions: () => Promise<void>;
}): void => {
  process.once('exit', () => {
    if (processShutdownState.shutdownPromise != null) {
      return;
    }

    processShutdownState.shutdownPromise = clearWorkerSessions().catch(() => {
      // Parent shutdown should remain best-effort.
    });
  });
};

/**
 * Install one-time process shutdown hooks for graceful worker cleanup.
 *
 * @param input - Hook-installation input.
 * @returns `void` after the relevant process hooks have been installed.
 */
export const installSharedWorkerProcessShutdownHooks = ({
  processShutdownState,
  hooks,
  includeProcessExitHook = false,
  exitAfterSignalCleanup = false,
  onShutdownStart,
  onShutdownComplete,
  onShutdownError
}: SharedWorkerProcessShutdownCallbacks & {
  processShutdownState: SharedWorkerHostProcessShutdownState;
  hooks: SharedWorkerProcessShutdownHooks;
  includeProcessExitHook?: boolean;
  exitAfterSignalCleanup?: boolean;
}): void => {
  if (processShutdownState.hasInstalledHooks) {
    return;
  }

  processShutdownState.hasInstalledHooks = true;

  if (includeProcessExitHook) {
    installSharedWorkerExitHook({
      processShutdownState,
      clearWorkerSessions: hooks.clearWorkerSessions
    });
  }

  process.once('SIGINT', () => {
    startSharedWorkerProcessShutdown({
      processShutdownState,
      signal: 'SIGINT',
      hooks,
      exitAfterCleanup: exitAfterSignalCleanup,
      onShutdownStart,
      onShutdownComplete,
      onShutdownError
    });
  });

  process.once('SIGTERM', () => {
    startSharedWorkerProcessShutdown({
      processShutdownState,
      signal: 'SIGTERM',
      hooks,
      exitAfterCleanup: exitAfterSignalCleanup,
      onShutdownStart,
      onShutdownComplete,
      onShutdownError
    });
  });

  if (process.platform === 'win32') {
    process.once('SIGBREAK', () => {
      startSharedWorkerProcessShutdown({
        processShutdownState,
        signal: 'SIGBREAK',
        hooks,
        exitAfterCleanup: exitAfterSignalCleanup,
        onShutdownStart,
        onShutdownComplete,
        onShutdownError
      });
    });
  }
};
