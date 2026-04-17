import { spawn } from 'node:child_process';
import process from 'node:process';

import {
  rejectWorkerSessionPendingRequests,
  type WorkerPendingRequest
} from './protocol';

/**
 * Shared host-side worker session lifecycle helpers.
 *
 * @remarks
 * This module owns the long-lived worker process/session mechanics shared by
 * the proxy worker host and the App page-data worker host:
 * - create the common base session shape
 * - spawn one child process with an IPC channel
 * - reuse or unregister a registry entry by stable session key
 * - force-close or finalize a session through one narrow set of helpers
 * - wait for full process termination
 *
 * Higher-level host-side session policy now lives in
 * `../host-lifecycle/*`, including:
 * - lifecycle phases
 * - readiness/reuse/replacement decisions
 * - graceful shutdown orchestration
 */

/**
 * Shared non-generic worker-session state reused by worker-family wrappers.
 *
 * @remarks
 * This base shape contains only payload-independent host-side session state.
 * Response-typed pending-request tracking is layered on top by
 * {@link WorkerSession}.
 */
export type WorkerSessionBase = {
  /**
   * Stable registry key used to identify and reuse one worker session.
   */
  sessionKey: string;
  /**
   * Child-process handle for the long-lived worker session.
   */
  child: ReturnType<typeof spawn>;
  /**
   * Shared graceful-shutdown promise reused by concurrent shutdown callers.
   */
  shutdownPromise: Promise<void> | null;
  /**
   * Promise that settles after the child process has fully terminated.
   */
  terminationPromise: Promise<void>;
  /**
   * Resolver used to settle {@link terminationPromise} once termination is
   * observed.
   */
  resolveTermination: () => void;
  /**
   * Whether the host has already marked this session closed.
   */
  closed: boolean;
};

/**
 * Shared base session shape reused by worker-family wrappers.
 *
 * @template TResponse Successful worker response union carried by the session.
 * Aspects of `TResponse` here:
 * - it models the successful response type carried by the stored
 *   `resolve(...)` callback
 * - it does not affect the stored `reject(...)` callback
 * - some shared helpers still thread `TResponse` through their signatures
 *   when they still need the real `pendingRequests` map shape, but do not
 *   read or forward any successful response value from those stored requests
 */
export type WorkerSession<TResponse> = WorkerSessionBase & {
  /**
   * In-flight host requests keyed by request id until one matching worker
   * response arrives.
   */
  pendingRequests: Map<string, WorkerPendingRequest<TResponse>>;
};

/**
 * Registry of live worker sessions keyed by stable session identity.
 */
export type WorkerSessionRegistry<TSession extends { sessionKey: string }> =
  Map<string, TSession>;

/**
 * Spawn one child worker process with an IPC channel.
 *
 * @param input - Spawn input.
 * @returns Child-process handle for the worker session.
 */
export const spawnWorkerChild = ({
  workerArgv,
  workerCwd,
  stdio,
  workerEnvironment
}: {
  workerArgv: Array<string>;
  workerCwd: string;
  /**
   * Keep the Node stdio contract explicit:
   * - slots 0-2 are stdin/stdout/stderr and stay limited to the string modes
   *   the proxy/build worker wrappers actually use
   * - slot 3 must stay `'ipc'` so the host can exchange structured requests
   *   and responses with the child process
   */
  stdio: [
    'ignore' | 'pipe' | 'inherit',
    'ignore' | 'pipe' | 'inherit',
    'ignore' | 'pipe' | 'inherit',
    'ipc'
  ];
  workerEnvironment?: NodeJS.ProcessEnv;
}): ReturnType<typeof spawn> =>
  spawn(process.execPath, workerArgv, {
    cwd: workerCwd,
    stdio,
    ...(workerEnvironment == null ? {} : { env: workerEnvironment })
  });

/**
 * Create the shared base session object reused by worker-family wrappers.
 *
 * @param input - Base-session input.
 * @returns Newly initialized shared base session.
 */
export const createWorkerSession = <TResponse>({
  sessionKey,
  child
}: {
  sessionKey: string;
  child: ReturnType<typeof spawn>;
}): WorkerSession<TResponse> => {
  let resolveWorkerSessionTermination = (): void => {};

  return {
    sessionKey,
    child,
    pendingRequests: new Map(),
    shutdownPromise: null,
    terminationPromise: new Promise(resolve => {
      resolveWorkerSessionTermination = resolve;
    }),
    resolveTermination: () => {
      resolveWorkerSessionTermination();
    },
    closed: false
  };
};

/**
 * Remove one worker session from the registry when it is still the registered
 * owner for its session key.
 *
 * @param workerSessions - Active host-side worker sessions.
 * @param session - Worker session that may still own its registry slot.
 * @returns `void` after the registry entry has been removed when applicable.
 */
export const unregisterWorkerSession = <
  TSession extends {
    sessionKey: string;
  }
>(
  workerSessions: WorkerSessionRegistry<TSession>,
  session: TSession
): void => {
  if (workerSessions.get(session.sessionKey) === session) {
    workerSessions.delete(session.sessionKey);
  }
};

/**
 * Force-close one worker session immediately.
 *
 * @remarks
 * This is the hard-stop fallback path used for bootstrap failures, protocol
 * corruption, and graceful-shutdown fallback. Normal replacement and explicit
 * cleanup should use the higher-level host lifecycle machine instead.
 *
 * The session intentionally remains registered until process termination is
 * observed. That lets the shared host lifecycle layer expose explicit
 * `failed` and `shutting-down` phases to concurrent callers instead of
 * creating a registry gap before the child has actually exited.
 *
 * @param input - Force-close input.
 * @returns `void` after the session has been marked closed and the child has
 * been killed.
 */
export const forceCloseWorkerSession = <TSession extends WorkerSessionBase>({
  workerSessions,
  session,
  reason,
  onSessionClose
}: {
  workerSessions: WorkerSessionRegistry<TSession>;
  session: TSession;
  reason: string;
  onSessionClose?: (reason: string) => void;
}): void => {
  void workerSessions;

  if (session.closed) {
    return;
  }

  session.closed = true;
  onSessionClose?.(reason);
  session.child.kill();
};

/**
 * Finalize one worker session after process termination.
 *
 * Aspects of `TResponse` in this helper:
 * - this helper still works against the real `pendingRequests` map shape
 * - it does not consume any successful response value from those stored
 *   pending requests
 * - `TResponse` remains in the signature so the session keeps its honest
 *   stored request shape
 *
 * @template TResponse Successful worker response union carried by the session.
 * @template TSession Concrete worker session shape.
 * @param input - Finalization input.
 * @returns `void` after registry ownership, pending requests, and termination
 * state have been settled.
 */
export const finalizeWorkerSession = <
  TResponse,
  TSession extends WorkerSession<TResponse>
>({
  workerSessions,
  session,
  rejectionError
}: {
  workerSessions: WorkerSessionRegistry<TSession>;
  session: TSession;
  rejectionError?: Error;
}): void => {
  const wasAlreadyClosed = session.closed;

  session.closed = true;
  unregisterWorkerSession(workerSessions, session);

  if (rejectionError != null && session.pendingRequests.size > 0) {
    rejectWorkerSessionPendingRequests(session, rejectionError);
  }

  if (!wasAlreadyClosed || session.pendingRequests.size === 0) {
    session.resolveTermination();
  }
};

/**
 * Wait for full worker-session termination, with an optional timeout fallback.
 *
 * @param session - Worker session expected to terminate.
 * @param timeoutMs - Maximum wait duration in milliseconds.
 * @param timeoutErrorMessage - Error message surfaced on timeout.
 * @returns A promise that settles after full worker termination.
 */
export const waitForWorkerTermination = async <
  TSession extends WorkerSessionBase
>(
  session: TSession,
  timeoutMs: number,
  timeoutErrorMessage: string
): Promise<void> =>
  await Promise.race([
    session.terminationPromise,
    new Promise<void>((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(timeoutErrorMessage));
      }, timeoutMs);

      session.terminationPromise.finally(() => {
        clearTimeout(timeoutId);
      });
    })
  ]);
