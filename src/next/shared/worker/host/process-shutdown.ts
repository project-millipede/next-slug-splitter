import process from 'node:process';

import type { WorkerHostProcessShutdownState } from './global-state';

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

export type WorkerProcessShutdownSignal = 'SIGINT' | 'SIGTERM' | 'SIGBREAK';

const resolveWorkerProcessShutdownExitCode = (
  signal: WorkerProcessShutdownSignal
): number => {
  if (signal === 'SIGTERM') {
    return SHARED_WORKER_SIGTERM_EXIT_CODE;
  }

  return SHARED_WORKER_SIGINT_EXIT_CODE;
};

type WorkerProcessShutdownHooks = {
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

type WorkerProcessShutdownStartInfo = {
  /**
   * Process signal that started the graceful shutdown flow.
   */
  signal: WorkerProcessShutdownSignal;
  /**
   * Number of still-active worker sessions observed when shutdown began.
   */
  sessionCount: number;
};

type WorkerProcessShutdownCompleteInfo = {
  /**
   * Process signal that started the graceful shutdown flow.
   */
  signal: WorkerProcessShutdownSignal;
  /**
   * Conventional process exit code paired with the shutdown signal.
   */
  exitCode: number;
};

type WorkerProcessShutdownErrorInfo = {
  /**
   * Process signal that started the graceful shutdown flow.
   */
  signal: WorkerProcessShutdownSignal;
  /**
   * Conventional process exit code paired with the shutdown signal.
   */
  exitCode: number;
  /**
   * Error thrown while clearing the retained worker sessions.
   */
  error: unknown;
};

type WorkerProcessShutdownCallbacks = {
  /**
   * Optional callback fired once shutdown starts and the active session count
   * has been sampled.
   */
  onShutdownStart?: (input: WorkerProcessShutdownStartInfo) => void;
  /**
   * Optional callback fired after worker-session cleanup completes
   * successfully.
   */
  onShutdownComplete?: (input: WorkerProcessShutdownCompleteInfo) => void;
  /**
   * Optional callback fired when worker-session cleanup throws.
   */
  onShutdownError?: (input: WorkerProcessShutdownErrorInfo) => void;
};

type StartWorkerProcessShutdownInput = WorkerProcessShutdownCallbacks & {
  /**
   * Shared parent-process shutdown state used to keep cleanup idempotent.
   */
  processShutdownState: WorkerHostProcessShutdownState;
  /**
   * Process signal currently being translated into graceful cleanup.
   */
  signal: WorkerProcessShutdownSignal;
  /**
   * Worker-family hooks used to inspect and clear retained sessions.
   */
  hooks: WorkerProcessShutdownHooks;
  /**
   * Whether the helper should call `process.exit(...)` after cleanup.
   */
  exitAfterCleanup: boolean;
};

const startWorkerProcessShutdown = ({
  processShutdownState,
  signal,
  hooks,
  exitAfterCleanup,
  onShutdownStart,
  onShutdownComplete,
  onShutdownError
}: StartWorkerProcessShutdownInput): void => {
  if (processShutdownState.shutdownPromise != null) {
    return;
  }

  processShutdownState.shutdownPromise = (async () => {
    const exitCode = resolveWorkerProcessShutdownExitCode(signal);
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

const installWorkerExitHook = ({
  processShutdownState,
  clearWorkerSessions
}: {
  processShutdownState: WorkerHostProcessShutdownState;
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
export const installWorkerProcessShutdownHooks = ({
  processShutdownState,
  hooks,
  includeProcessExitHook = false,
  exitAfterSignalCleanup = false,
  onShutdownStart,
  onShutdownComplete,
  onShutdownError
}: WorkerProcessShutdownCallbacks & {
  processShutdownState: WorkerHostProcessShutdownState;
  hooks: WorkerProcessShutdownHooks;
  includeProcessExitHook?: boolean;
  exitAfterSignalCleanup?: boolean;
}): void => {
  if (processShutdownState.hasInstalledHooks) {
    return;
  }

  processShutdownState.hasInstalledHooks = true;

  if (includeProcessExitHook) {
    installWorkerExitHook({
      processShutdownState,
      clearWorkerSessions: hooks.clearWorkerSessions
    });
  }

  process.once('SIGINT', () => {
    startWorkerProcessShutdown({
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
    startWorkerProcessShutdown({
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
      startWorkerProcessShutdown({
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
