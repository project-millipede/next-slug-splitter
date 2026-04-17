import type { WorkerHostLifecycleSessionBase } from '../../types';

/**
 * Shared error and wait helpers for the host lifecycle machine.
 *
 * @remarks
 * These helpers stay intentionally small and stateless:
 * - normalize unknown failures
 * - wait for shutdown acknowledgement with timeout fallback
 * - surface readiness and replacement failures consistently
 * - await the shared `readyPromise` owned by the host lifecycle session
 */

/**
 * Normalize one unknown lifecycle failure into an `Error`.
 *
 * @param error Unknown lifecycle failure.
 * @param fallbackMessage Message used when the failure is not already an
 * `Error`.
 * @returns Normalized `Error` instance.
 */
export const toWorkerHostLifecycleError = (
  error: unknown,
  fallbackMessage: string
): Error => (error instanceof Error ? error : new Error(fallbackMessage));

/**
 * Wait for one shutdown acknowledgement with timeout fallback.
 *
 * @template TResponse Successful acknowledgement response.
 * @param requestPromise In-flight shutdown acknowledgement promise.
 * @param timeoutMs Maximum wait duration in milliseconds.
 * @returns The acknowledgement response, or the string `'timeout'` when the
 * wait exceeded the configured timeout.
 */
export const waitForWorkerHostAcknowledgement = async <TResponse>(
  requestPromise: Promise<TResponse>,
  timeoutMs: number
): Promise<TResponse | 'timeout'> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<'timeout'>(resolve => {
    timeoutHandle = setTimeout(() => {
      resolve('timeout');
    }, timeoutMs);
  });

  try {
    return await Promise.race([requestPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle != null) {
      clearTimeout(timeoutHandle);
    }
  }
};

/**
 * Create the error surfaced when a host caller awaited a session that did not
 * become ready.
 *
 * @param workerLabel Human-readable worker label.
 * @param session Session that failed to become ready.
 * @returns Readiness failure error.
 */
export const createWorkerHostLifecycleReadinessError = (
  workerLabel: string,
  session: WorkerHostLifecycleSessionBase
): Error =>
  session.failureError ??
  new Error(
    `next-slug-splitter ${workerLabel} session "${session.sessionKey}" did not become ready.`
  );

/**
 * Create the error surfaced when a still-starting session is replaced.
 *
 * @param workerLabel Human-readable worker label.
 * @param session Session being replaced.
 * @param reason Diagnostic replacement reason.
 * @returns Replacement readiness error.
 */
export const createWorkerHostLifecycleReplacementError = (
  workerLabel: string,
  session: WorkerHostLifecycleSessionBase,
  reason: string
): Error =>
  new Error(
    `next-slug-splitter ${workerLabel} session "${session.sessionKey}" was replaced before startup completed (${reason}).`
  );

/**
 * Await the shared readiness promise for one host-managed session.
 *
 * @param workerLabel Human-readable worker label.
 * @param session Host-managed session.
 * @returns `void` after the session is ready.
 */
export const waitForWorkerHostSessionReady = async (
  workerLabel: string,
  session: WorkerHostLifecycleSessionBase
): Promise<void> => {
  try {
    await session.readyPromise;
  } catch {
    throw createWorkerHostLifecycleReadinessError(workerLabel, session);
  }

  if (session.phase !== 'ready') {
    throw createWorkerHostLifecycleReadinessError(workerLabel, session);
  }
};
