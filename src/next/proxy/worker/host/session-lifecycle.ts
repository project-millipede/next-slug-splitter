import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { debugRouteHandlerProxy } from '../../observability/debug-log';
import {
  createWorkerExitError,
  createWorkerRequestId,
  resolveWorkerResponseEnvelope
} from '../../../shared/worker/host/protocol';
import { getRouteHandlerProxyWorkerHostGlobalState } from './global-state';
import { sendRouteHandlerProxyWorkerRequest } from './protocol';
import {
  createWorkerSession,
  spawnWorkerChild,
  type WorkerSessionRegistry
} from '../../../shared/worker/host/session-lifecycle';
import { createWorkerHostLifecycleMachine } from '../../../shared/worker/host-lifecycle/machine';
import {
  createCustomWorkerHostLifecycleSession,
  forceCloseWorkerHostLifecycleSession
} from '../../../shared/worker/host-lifecycle/session';
import type { WorkerHostLifecycleSession } from '../../../shared/worker/host-lifecycle/types';
import type { WorkerShutdownRequest } from '../../../shared/worker/types';

import type {
  BootstrapGenerationToken,
  RouteHandlerProxyConfigRegistration
} from '../../runtime/types';
import type {
  RouteHandlerProxyWorkerBootstrapRequest,
  RouteHandlerProxyWorkerBootstrapResponse,
  RouteHandlerProxyWorkerResponse,
  RouteHandlerProxyWorkerResponseEnvelope,
  RouteHandlerProxyWorkerShutdownResponse,
  RouteHandlerProxyWorkerSessionInput
} from '../types';

/**
 * Host-side worker session lifecycle for the dedicated proxy worker.
 *
 * @remarks
 * This module owns the proxy-worker-specific session mechanics that remain
 * above the shared host/session base:
 * - resolve spawn arguments and environment from one config registration
 * - bootstrap a worker session for one generation
 * - reuse that session while the bootstrap generation remains unchanged
 * - replace the session when the bootstrap generation changes
 *
 * Lower-level child-process/session mechanics now live in
 * `src/next/shared/worker/host/session-lifecycle.ts`, while the shared host
 * reuse/readiness/shutdown policy now lives in
 * `src/next/shared/worker/host-lifecycle/*`.
 */
const SLUG_SPLITTER_CONFIG_PATH_ENV = 'SLUG_SPLITTER_CONFIG_PATH';
const SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV = 'SLUG_SPLITTER_CONFIG_ROOT_DIR';
const EXPERIMENTAL_STRIP_TYPES_FLAG = '--experimental-strip-types';
const ROUTE_HANDLER_PROXY_WORKER_SHUTDOWN_TIMEOUT_MS = 2000;

export type RouteHandlerProxyWorkerSession = WorkerHostLifecycleSession<
  | RouteHandlerProxyWorkerBootstrapResponse
  | RouteHandlerProxyWorkerShutdownResponse
  | RouteHandlerProxyWorkerResponse
> & {
  bootstrapGenerationToken: BootstrapGenerationToken;
  bootstrapPromise: Promise<void>;
};

type RouteHandlerProxyWorkerSessionRegistry =
  WorkerSessionRegistry<RouteHandlerProxyWorkerSession>;

const routeHandlerProxyWorkerProtocolState =
  getRouteHandlerProxyWorkerHostGlobalState().protocol;

/**
 * Resolve the explicit config registration this proxy request wants the worker
 * to use.
 *
 * @remarks
 * The explicit request options are the preferred source of truth. Environment
 * fallback still exists for tests and older integration edges, but the real
 * production of these values should happen at adapter time and travel through
 * the generated `proxy.ts` bridge.
 *
 * @param configRegistration - Adapter-time registration forwarded by the
 * generated root Proxy file.
 * @returns Normalized registration values with environment fallback.
 */
const resolveRouteHandlerProxyWorkerConfigRegistration = (
  configRegistration: RouteHandlerProxyConfigRegistration = {}
): RouteHandlerProxyConfigRegistration => ({
  configPath:
    configRegistration.configPath ?? process.env[SLUG_SPLITTER_CONFIG_PATH_ENV],
  rootDir:
    configRegistration.rootDir ?? process.env[SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV]
});

/**
 * Resolve the bundled worker entry path.
 *
 * @remarks
 * This path resolution must stay purely filesystem-based. Even a seemingly
 * harmless module-style lookup such as `require.resolve('./proxy-lazy-worker')`
 * gives Turbopack a concrete module edge from the thin Proxy bundle into the
 * heavy worker bundle, which is exactly what we must avoid. The worker file is
 * a sibling artifact on disk, so we resolve it like one.
 *
 * @param configRegistration - Adapter-time registration forwarded by the
 * generated root Proxy file.
 * @returns Absolute worker bundle path.
 */
const resolveRouteHandlerProxyWorkerEntryPath = (
  configRegistration: RouteHandlerProxyConfigRegistration = {}
): string => {
  const { rootDir: registeredRootDir } =
    resolveRouteHandlerProxyWorkerConfigRegistration(configRegistration);

  if (registeredRootDir != null && registeredRootDir.length > 0) {
    const installedWorkerPath = path.resolve(
      registeredRootDir,
      'node_modules',
      'next-slug-splitter',
      'dist',
      'next',
      'proxy-lazy-worker.js'
    );

    if (existsSync(installedWorkerPath)) {
      return installedWorkerPath;
    }
  }

  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'proxy-lazy-worker.js'
  );
};

/**
 * Determine whether the app-owned config path requires Node's built-in
 * type-stripping loader.
 *
 * @param configRegistration - Adapter-time registration forwarded by the
 * generated root Proxy file.
 * @returns `true` when the registered config file uses a TS extension.
 */
const shouldUseRouteHandlerProxyWorkerStripTypes = (
  configRegistration: RouteHandlerProxyConfigRegistration = {}
): boolean => {
  const { configPath: registeredConfigPath } =
    resolveRouteHandlerProxyWorkerConfigRegistration(configRegistration);

  if (registeredConfigPath == null) {
    return false;
  }

  return /\.(?:cts|mts|ts)$/u.test(registeredConfigPath);
};

/**
 * Build the Node argv used to launch the dedicated lazy worker.
 *
 * @param configRegistration - Adapter-time registration forwarded by the
 * generated root Proxy file.
 * @returns Worker process argv.
 */
const resolveRouteHandlerProxyWorkerArgv = (
  configRegistration: RouteHandlerProxyConfigRegistration = {}
): string[] => {
  const workerEntryPath =
    resolveRouteHandlerProxyWorkerEntryPath(configRegistration);

  if (!shouldUseRouteHandlerProxyWorkerStripTypes(configRegistration)) {
    return [workerEntryPath];
  }

  if (!process.allowedNodeEnvironmentFlags.has(EXPERIMENTAL_STRIP_TYPES_FLAG)) {
    throw new Error(
      'next-slug-splitter dev proxy worker requires Node support for "--experimental-strip-types" when SLUG_SPLITTER_CONFIG_PATH points to a TypeScript file.'
    );
  }

  return [EXPERIMENTAL_STRIP_TYPES_FLAG, workerEntryPath];
};

/**
 * Resolve the working directory for the dev-only worker process.
 *
 * @param configRegistration - Adapter-time config registration forwarded by the
 * generated root Proxy file.
 * @returns Worker cwd.
 */
const resolveRouteHandlerProxyWorkerCwd = (
  configRegistration: RouteHandlerProxyConfigRegistration = {}
): string => {
  const { rootDir: registeredRootDir, configPath: registeredConfigPath } =
    resolveRouteHandlerProxyWorkerConfigRegistration(configRegistration);

  if (registeredRootDir != null && registeredRootDir.length > 0) {
    return registeredRootDir;
  }

  if (registeredConfigPath != null && registeredConfigPath.length > 0) {
    return path.dirname(registeredConfigPath);
  }

  return process.cwd();
};

/**
 * Materialize the environment passed into the child worker process.
 *
 * @param configRegistration - Adapter-time config registration forwarded by the
 * generated root Proxy file.
 * @returns Plain environment object for `spawn(...)`.
 */
const createRouteHandlerProxyWorkerEnvironment = (
  configRegistration: RouteHandlerProxyConfigRegistration = {}
): NodeJS.ProcessEnv => {
  const workerEnvironment: NodeJS.ProcessEnv = {
    ...process.env
  };
  const { configPath: registeredConfigPath, rootDir: registeredRootDir } =
    resolveRouteHandlerProxyWorkerConfigRegistration(configRegistration);

  if (registeredConfigPath != null) {
    workerEnvironment[SLUG_SPLITTER_CONFIG_PATH_ENV] = registeredConfigPath;
  }

  if (registeredRootDir != null) {
    workerEnvironment[SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV] = registeredRootDir;
  }

  return workerEnvironment;
};

/**
 * Resolve the stable host-side session key.
 *
 * @param configRegistration - Adapter-time config registration forwarded by the
 * generated root Proxy file.
 * @returns Stable session key scoped to one app registration.
 */
const createRouteHandlerProxyWorkerSessionKey = (
  configRegistration: RouteHandlerProxyConfigRegistration = {}
): string => {
  const resolvedRegistration =
    resolveRouteHandlerProxyWorkerConfigRegistration(configRegistration);

  return JSON.stringify([
    resolvedRegistration.configPath ?? null,
    resolvedRegistration.rootDir ?? null
  ]);
};

/**
 * Force-close one worker session immediately.
 *
 * @param input - Force-close input.
 * @returns `void` after the session has been marked closed and the child has
 * been killed.
 */
const forceCloseRouteHandlerProxyWorkerSession = ({
  workerSessions,
  session,
  reason
}: {
  workerSessions: RouteHandlerProxyWorkerSessionRegistry;
  session: RouteHandlerProxyWorkerSession;
  reason: string;
}): void => {
  if (session.phase === 'shutting-down') {
    debugRouteHandlerProxy('lazy-worker:shutdown-timeout', {
      reason,
      bootstrapGenerationToken: session.bootstrapGenerationToken
    });
  }

  forceCloseWorkerHostLifecycleSession({
    workerSessions,
    session,
    reason,
    onSessionClose: nextReason => {
      debugRouteHandlerProxy('lazy-worker:session-close', {
        reason: nextReason,
        bootstrapGenerationToken: session.bootstrapGenerationToken
      });
    }
  });
};

/**
 * Shared host lifecycle machine for the dedicated proxy worker family.
 *
 * @remarks
 * The proxy host keeps its own business semantics local:
 * - generation-token compatibility
 * - bootstrap-based readiness
 * - adapter-owned config registration
 * - proxy diagnostics
 *
 * Shared host lifecycle policy such as:
 * - reuse vs replace orchestration
 * - shared `readyPromise` handling
 * - graceful shutdown idempotence
 * - failed/shutting-down/closed transitions
 *
 * is delegated into the shared machine.
 */
const routeHandlerProxyWorkerHostLifecycleMachine =
  createWorkerHostLifecycleMachine<
    | RouteHandlerProxyWorkerBootstrapResponse
    | RouteHandlerProxyWorkerShutdownResponse
    | RouteHandlerProxyWorkerResponse,
    RouteHandlerProxyWorkerSession,
    RouteHandlerProxyWorkerSessionInput
  >({
    workerLabel: 'proxy worker',
    session: {
      createSessionKey: ({ configRegistration }) =>
        createRouteHandlerProxyWorkerSessionKey(configRegistration),
      createSession: ({ workerSessions, request }) =>
        createRouteHandlerProxyWorkerSession({
          workerSessions,
          localeConfig: request.localeConfig,
          bootstrapGenerationToken: request.bootstrapGenerationToken,
          configRegistration: request.configRegistration
        }),
      isSessionReusable: ({ session, request }) =>
        session.bootstrapGenerationToken === request.bootstrapGenerationToken
          ? 'reuse'
          : 'replace',
      startSession: async ({ session }) => {
        await session.bootstrapPromise;
      },
      replaceReason: 'bootstrap-generation-changed'
    },
    shutdown: {
      requestShutdown: async ({ session, reason }) => {
        const request: WorkerShutdownRequest = {
          requestId: createWorkerRequestId(
            routeHandlerProxyWorkerProtocolState,
            'route-handler-proxy-worker-request'
          ),
          subject: 'shutdown'
        };

        try {
          await sendRouteHandlerProxyWorkerRequest(session, request);
        } catch (error) {
          debugRouteHandlerProxy('lazy-worker:shutdown-error', {
            reason,
            bootstrapGenerationToken: session.bootstrapGenerationToken,
            message: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
      },
      acknowledgementTimeoutMs: ROUTE_HANDLER_PROXY_WORKER_SHUTDOWN_TIMEOUT_MS,
      forceCloseSession: ({ workerSessions, session, reason }) => {
        forceCloseRouteHandlerProxyWorkerSession({
          workerSessions,
          session,
          reason
        });
      }
    }
  });

/**
 * Gracefully shut down one worker session and wait for full process
 * termination.
 *
 * @param input - Shutdown input.
 * @param input.workerSessions - Active host-side worker sessions.
 * @param input.session - Worker session being shut down.
 * @param input.reason - Diagnostic reason recorded for the shutdown.
 * @returns `void` after the worker has either acknowledged shutdown and exited
 * or been killed via fallback and terminated.
 */
export const shutdownRouteHandlerProxyWorkerSessionGracefully = async ({
  workerSessions,
  session,
  reason
}: {
  workerSessions: RouteHandlerProxyWorkerSessionRegistry;
  session: RouteHandlerProxyWorkerSession;
  reason: string;
}): Promise<void> => {
  debugRouteHandlerProxy('lazy-worker:shutdown-start', {
    reason,
    bootstrapGenerationToken: session.bootstrapGenerationToken
  });
  debugRouteHandlerProxy('lazy-worker:session-close', {
    reason,
    bootstrapGenerationToken: session.bootstrapGenerationToken
  });

  await routeHandlerProxyWorkerHostLifecycleMachine.shutdownSession({
    workerSessions,
    session,
    reason
  });
};

/**
 * Spawn and bootstrap one persistent worker session.
 *
 * @remarks
 * Session-creation aspects:
 * - Transport: the child is spawned with an IPC channel in addition to stderr
 *   and stdout pipes.
 * - Bootstrap: the host immediately sends a bootstrap request before the
 *   session is considered ready.
 * - Diagnostics: stderr is still collected for error surfacing and debug
 *   logging, but it is not part of the request protocol.
 *
 * @param input - Session-creation input.
 * @param input.workerSessions - Active host-side worker sessions.
 * @param input.localeConfig - Locale semantics for the current worker generation.
 * @param input.bootstrapGenerationToken - Parent-issued bootstrap generation token.
 * @param input.configRegistration - Adapter-time config registration.
 * @returns Persistent worker session for one bootstrap generation.
 */
const createRouteHandlerProxyWorkerSession = ({
  workerSessions,
  localeConfig,
  bootstrapGenerationToken,
  configRegistration
}: RouteHandlerProxyWorkerSessionInput & {
  workerSessions: RouteHandlerProxyWorkerSessionRegistry;
}): RouteHandlerProxyWorkerSession => {
  const sessionKey =
    createRouteHandlerProxyWorkerSessionKey(configRegistration);
  const workerArgv = resolveRouteHandlerProxyWorkerArgv(configRegistration);
  const workerCwd = resolveRouteHandlerProxyWorkerCwd(configRegistration);
  const workerEnvironment =
    createRouteHandlerProxyWorkerEnvironment(configRegistration);

  debugRouteHandlerProxy('lazy-worker:spawn', {
    cwd: workerCwd,
    argv: workerArgv,
    hasConfigPath:
      typeof workerEnvironment[SLUG_SPLITTER_CONFIG_PATH_ENV] === 'string',
    hasRootDir:
      typeof workerEnvironment[SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV] === 'string',
    bootstrapGenerationToken
  });

  const child = spawnWorkerChild({
    workerArgv,
    workerCwd,
    workerEnvironment,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  const baseSession = createWorkerSession<
    | RouteHandlerProxyWorkerBootstrapResponse
    | RouteHandlerProxyWorkerShutdownResponse
    | RouteHandlerProxyWorkerResponse
  >({
    sessionKey,
    child
  });
  const session = createCustomWorkerHostLifecycleSession(
    baseSession,
    lifecycleSession => ({
      ...lifecycleSession,
      /**
       * Bind the long-lived worker session to the parent bootstrap generation
       * that created it so reuse can reject sessions from older generations.
       */
      bootstrapGenerationToken,
      /**
       * Seed the proxy-specific bootstrap promise with a settled placeholder so
       * the session has a complete proxy-owned shape before the real bootstrap
       * IPC request is assembled and sent below.
       */
      bootstrapPromise: Promise.resolve()
    })
  );

  const stderrChunks: Array<Buffer> = [];

  child.on('message', (envelope: RouteHandlerProxyWorkerResponseEnvelope) => {
    resolveWorkerResponseEnvelope(session, envelope);
  });

  child.stderr?.on('data', chunk => {
    const normalizedChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    stderrChunks.push(normalizedChunk);
    debugRouteHandlerProxy('lazy-worker:stderr', {
      text: normalizedChunk.toString('utf8').trim()
    });
  });

  child.on('error', error => {
    const rejectionError =
      error instanceof Error ? error : new Error(String(error));

    routeHandlerProxyWorkerHostLifecycleMachine.observeSessionTermination({
      workerSessions,
      session,
      rejectionError
    });
  });

  child.on('close', (exitCode, signal) => {
    debugRouteHandlerProxy('lazy-worker:child-close', {
      exitCode,
      signal,
      bootstrapGenerationToken: session.bootstrapGenerationToken,
      pendingRequestCount: session.pendingRequests.size
    });

    if (session.phase === 'shutting-down') {
      debugRouteHandlerProxy('lazy-worker:shutdown-complete', {
        bootstrapGenerationToken: session.bootstrapGenerationToken
      });
    }

    const shouldRejectPendingRequests =
      session.pendingRequests.size > 0 || exitCode !== 0;

    routeHandlerProxyWorkerHostLifecycleMachine.observeSessionTermination({
      workerSessions,
      session,
      rejectionError: shouldRejectPendingRequests
        ? createWorkerExitError({
            workerLabel: 'proxy worker',
            exitCode,
            stderrChunks
          })
        : undefined
    });
  });

  const bootstrapRequest: RouteHandlerProxyWorkerBootstrapRequest = {
    // Bootstrap carries the clear adapter-owned registration values the
    // worker needs to reload runtime attachments for this generation.
    requestId: createWorkerRequestId(
      routeHandlerProxyWorkerProtocolState,
      'route-handler-proxy-worker-request'
    ),
    subject: 'bootstrap',
    payload: {
      bootstrapGenerationToken,
      localeConfig,
      configRegistration
    }
  };

  /**
   * Replace the settled placeholder promise with the real bootstrap IPC flow
   * now that the worker session exists and the bootstrap request can be sent
   * through it.
   */
  session.bootstrapPromise = sendRouteHandlerProxyWorkerRequest(
    session,
    bootstrapRequest
  ).then(response => {
    if (
      response.subject !== 'bootstrapped' ||
      response.payload.bootstrapGenerationToken !== bootstrapGenerationToken
    ) {
      throw new Error(
        'next-slug-splitter proxy worker bootstrap returned an unexpected generation token.'
      );
    }
  });

  return session;
};

/**
 * Resolve or restart the worker session for the requested bootstrap generation.
 *
 * @remarks
 * Resolution aspects:
 * - Reuse: an existing session is reused only when the generation token still
 *   matches.
 * - Restart: generation changes force a full session restart and re-bootstrap.
 * - Readiness: callers await bootstrap completion before using the session.
 *
 * @param input - Session-resolution input.
 * @param input.workerSessions - Active host-side worker sessions.
 * @param input.localeConfig - Locale semantics for the current worker generation.
 * @param input.bootstrapGenerationToken - Parent-issued bootstrap generation token.
 * @param input.configRegistration - Adapter-time config registration.
 * @returns Ready worker session for the current generation.
 */
export const resolveRouteHandlerProxyWorkerSession = async ({
  workerSessions,
  localeConfig,
  bootstrapGenerationToken,
  configRegistration
}: RouteHandlerProxyWorkerSessionInput & {
  workerSessions: RouteHandlerProxyWorkerSessionRegistry;
}): Promise<RouteHandlerProxyWorkerSession> => {
  return await routeHandlerProxyWorkerHostLifecycleMachine.resolveSession({
    workerSessions,
    request: {
      localeConfig,
      bootstrapGenerationToken,
      configRegistration
    }
  });
};
