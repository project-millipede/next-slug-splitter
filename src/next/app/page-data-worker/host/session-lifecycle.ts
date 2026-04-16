import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createSharedWorkerExitError,
  createSharedWorkerRequestId,
  resolveSharedWorkerResponseEnvelope
} from '../../../shared/worker/host/protocol';
import { getAppPageDataWorkerHostGlobalState } from './global-state';
import { sendAppPageDataWorkerRequest } from './protocol';
import {
  createSharedWorkerSession,
  spawnSharedWorkerChild,
  type SharedWorkerSessionRegistry
} from '../../../shared/worker/host/session-lifecycle';
import {
  createSharedWorkerHostLifecycleMachine
} from '../../../shared/worker/host-lifecycle/machine';
import {
  createSharedWorkerHostLifecycleSession
} from '../../../shared/worker/host-lifecycle/session';
import type { SharedWorkerHostLifecycleSession } from '../../../shared/worker/host-lifecycle/types';
import type { SharedWorkerShutdownRequest } from '../../../shared/worker/types';

import type {
  AppPageDataWorkerResponse,
  AppPageDataWorkerResponseEnvelope
} from '../types';

const APP_PAGE_DATA_WORKER_SHUTDOWN_TIMEOUT_MS = 2000;

export type AppPageDataWorkerSession =
  SharedWorkerHostLifecycleSession<AppPageDataWorkerResponse>;

type AppPageDataWorkerSessionRegistry =
  SharedWorkerSessionRegistry<AppPageDataWorkerSession>;

const appPageDataWorkerProtocolState =
  getAppPageDataWorkerHostGlobalState().protocol;

/**
 * Resolve the runtime entry file for the App page-data worker.
 *
 * @param rootDir Application root directory used to prefer the installed
 * package build when available.
 * @returns Absolute path to the worker runtime entry file.
 */
const resolveAppPageDataWorkerEntryPath = (rootDir: string): string => {
  const installedWorkerPath = path.resolve(
    rootDir,
    'node_modules',
    'next-slug-splitter',
    'dist',
    'next',
    'app-page-data-worker.js'
  );

  if (existsSync(installedWorkerPath)) {
    return installedWorkerPath;
  }

  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'app-page-data-worker.js'
  );
};

/**
 * Create the stable session-registry key for one application root.
 *
 * @param rootDir Application root directory.
 * @returns Stable serialized session key.
 */
const createAppPageDataWorkerSessionKey = (rootDir: string): string =>
  JSON.stringify([rootDir]);

/**
 * Shared host lifecycle machine for the App page-data worker family.
 *
 * @remarks
 * App page-data sessions are simple compared with proxy sessions:
 * - reuse is scoped only by `rootDir`
 * - readiness is immediate after spawn and listener wiring
 * - shutdown uses the shared worker `shutdown` action over IPC
 */
const appPageDataWorkerHostLifecycleMachine =
  createSharedWorkerHostLifecycleMachine<
    AppPageDataWorkerResponse,
    AppPageDataWorkerSession,
    {
      rootDir: string;
    }
  >({
    workerLabel: 'App page-data worker',
    session: {
      createSessionKey: ({ rootDir }) =>
        createAppPageDataWorkerSessionKey(rootDir),
      createSession: ({ workerSessions, request }) =>
        createAppPageDataWorkerSession({
          workerSessions,
          rootDir: request.rootDir
        })
    },
    shutdown: {
      requestShutdown: async ({ session }) => {
        const request: SharedWorkerShutdownRequest = {
          requestId: createSharedWorkerRequestId(
            appPageDataWorkerProtocolState,
            'app-page-data-worker-request'
          ),
          subject: 'shutdown'
        };

        await sendAppPageDataWorkerRequest(session, request);
      },
      acknowledgementTimeoutMs: APP_PAGE_DATA_WORKER_SHUTDOWN_TIMEOUT_MS,
      terminationTimeoutMs: APP_PAGE_DATA_WORKER_SHUTDOWN_TIMEOUT_MS,
      terminationTimeoutErrorMessage:
        'Timed out waiting for next-slug-splitter App page-data worker shutdown.'
    }
  });

/**
 * Request graceful shutdown for one App page-data worker session.
 *
 * @param input Shutdown input.
 * @param input.workerSessions Session registry that owns the session.
 * @param input.session Session to shut down.
 * @returns A promise that settles after shutdown or forced termination.
 */
export const shutdownAppPageDataWorkerSessionGracefully = async ({
  workerSessions,
  session
}: {
  workerSessions: AppPageDataWorkerSessionRegistry;
  session: AppPageDataWorkerSession;
}): Promise<void> => {
  await appPageDataWorkerHostLifecycleMachine.shutdownSession({
    workerSessions,
    session,
    reason: 'app-page-data-session-shutdown'
  });
};

/**
 * Spawn and wire one App page-data worker session.
 *
 * @param input Session creation input.
 * @param input.workerSessions Session registry that will own the session.
 * @param input.rootDir Application root used to resolve the worker bundle.
 * @returns Newly created worker session.
 */
const createAppPageDataWorkerSession = ({
  workerSessions,
  rootDir
}: {
  workerSessions: AppPageDataWorkerSessionRegistry;
  rootDir: string;
}): AppPageDataWorkerSession => {
  const sessionKey = createAppPageDataWorkerSessionKey(rootDir);
  const stderrChunks: Array<Buffer> = [];
  const child = spawnSharedWorkerChild({
    workerArgv: [resolveAppPageDataWorkerEntryPath(rootDir)],
    workerCwd: rootDir,
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  const session = createSharedWorkerHostLifecycleSession(
    createSharedWorkerSession<AppPageDataWorkerResponse>({
      sessionKey,
      child
    })
  );

  // Stderr is buffered so unexpected exits can surface actionable worker
  // context instead of a generic exit-code-only failure.
  child.stderr?.on('data', chunk => {
    stderrChunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')
    );
  });

  child.on('message', (envelope: AppPageDataWorkerResponseEnvelope) => {
    resolveSharedWorkerResponseEnvelope(session, envelope);
  });

  child.on('exit', exitCode => {
    const shouldRejectPendingRequests =
      session.pendingRequests.size > 0 || exitCode !== 0;

    appPageDataWorkerHostLifecycleMachine.observeSessionTermination({
      workerSessions,
      session,
      rejectionError: shouldRejectPendingRequests
        ? createSharedWorkerExitError({
            workerLabel: 'App page-data worker',
            exitCode,
            stderrChunks
          })
        : undefined
    });
  });

  child.on('error', error => {
    stderrChunks.push(Buffer.from(String(error), 'utf8'));
    appPageDataWorkerHostLifecycleMachine.observeSessionTermination({
      workerSessions,
      session,
      rejectionError: createSharedWorkerExitError({
        workerLabel: 'App page-data worker',
        exitCode: child.exitCode,
        stderrChunks
      })
    });
  });

  return session;
};

/**
 * Resolve the reusable App page-data worker session for one application root.
 *
 * @param input Session lookup input.
 * @param input.workerSessions Session registry shared by the host process.
 * @param input.rootDir Application root used to scope session reuse.
 * @returns A live worker session for the requested application root.
 */
export const resolveAppPageDataWorkerSession = async ({
  workerSessions,
  rootDir
}: {
  workerSessions: AppPageDataWorkerSessionRegistry;
  rootDir: string;
}): Promise<AppPageDataWorkerSession> =>
  await appPageDataWorkerHostLifecycleMachine.resolveSession({
    workerSessions,
    request: {
      rootDir
    }
  });
