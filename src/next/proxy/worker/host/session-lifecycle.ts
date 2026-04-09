import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { debugRouteHandlerProxy } from '../../observability/debug-log';
import {
  createRouteHandlerProxyWorkerExitError,
  createRouteHandlerProxyWorkerRequestId,
  rejectRouteHandlerProxyWorkerSessionPendingRequests,
  sendRouteHandlerProxyWorkerRequest,
  type RouteHandlerProxyWorkerPendingRequest
} from './protocol';

import type {
  BootstrapGenerationToken,
  RouteHandlerProxyConfigRegistration
} from '../../runtime/types';
import type {
  RouteHandlerProxyWorkerBootstrapResponse,
  RouteHandlerProxyWorkerResponseEnvelope,
  RouteHandlerProxyWorkerSessionInput,
  RouteHandlerProxyWorkerShutdownResponse
} from '../types';

/**
 * Host-side worker session lifecycle for the dedicated proxy worker.
 *
 * @remarks
 * This module owns the long-lived worker process/session mechanics:
 * - resolve spawn arguments and environment from one config registration
 * - create and bootstrap a worker session
 * - reuse that session while the bootstrap generation remains unchanged
 * - replace or terminate the session through graceful shutdown with fallback
 *
 * IPC request/response transport stays in `protocol.ts`, while the public host
 * API stays in `client.ts`.
 */
const SLUG_SPLITTER_CONFIG_PATH_ENV = 'SLUG_SPLITTER_CONFIG_PATH';
const SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV = 'SLUG_SPLITTER_CONFIG_ROOT_DIR';
const EXPERIMENTAL_STRIP_TYPES_FLAG = '--experimental-strip-types';
const ROUTE_HANDLER_PROXY_WORKER_SHUTDOWN_TIMEOUT_MS = 2000;

export type RouteHandlerProxyWorkerSession = {
  sessionKey: string;
  bootstrapGenerationToken: BootstrapGenerationToken;
  child: ReturnType<typeof spawn>;
  pendingRequests: Map<string, RouteHandlerProxyWorkerPendingRequest>;
  bootstrapPromise: Promise<void>;
  shutdownPromise: Promise<void> | null;
  terminationPromise: Promise<void>;
  resolveTermination: () => void;
  closed: boolean;
};

type RouteHandlerProxyWorkerSessionRegistry = Map<
  string,
  RouteHandlerProxyWorkerSession
>;

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
 * @param configRegistration - Adapter-time registration forwarded by the
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
 * @param configRegistration - Adapter-time registration forwarded by the
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
 * @param configRegistration - Adapter-time registration forwarded by the
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
 * Remove one worker session from the registry when it is still the registered
 * owner for its session key.
 *
 * @param workerSessions - Active host-side worker sessions.
 * @param session - Worker session that may still own its registry slot.
 * @returns `void` after the registry entry has been removed when applicable.
 */
const unregisterRouteHandlerProxyWorkerSession = (
  workerSessions: RouteHandlerProxyWorkerSessionRegistry,
  session: RouteHandlerProxyWorkerSession
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
 * cleanup should use the graceful shutdown helper instead.
 *
 * @param workerSessions - Active host-side worker sessions.
 * @param session - Worker session being closed.
 * @param reason - Diagnostic reason recorded for the close event.
 * @returns `void` after the session has been marked closed and the child has
 * been killed.
 */
const forceCloseRouteHandlerProxyWorkerSession = (
  workerSessions: RouteHandlerProxyWorkerSessionRegistry,
  session: RouteHandlerProxyWorkerSession,
  reason: string
): void => {
  unregisterRouteHandlerProxyWorkerSession(workerSessions, session);

  if (session.closed) {
    return;
  }

  session.closed = true;

  debugRouteHandlerProxy('lazy-worker:session-close', {
    reason,
    bootstrapGenerationToken: session.bootstrapGenerationToken
  });

  session.child.kill();
};

/**
 * Wait for a `shutdown-complete` acknowledgement from one worker session, with
 * a timeout fallback.
 *
 * @param session - Worker session expected to acknowledge graceful shutdown.
 * @returns The worker shutdown acknowledgement, or the string `'timeout'`
 * when the wait exceeded the configured shutdown timeout.
 */
const waitForRouteHandlerProxyWorkerShutdownAcknowledgement = async (
  session: RouteHandlerProxyWorkerSession
): Promise<RouteHandlerProxyWorkerShutdownResponse | 'timeout'> => {
  let shutdownTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const shutdownTimeoutPromise = new Promise<'timeout'>(resolve => {
    shutdownTimeoutHandle = setTimeout(() => {
      resolve('timeout');
    }, ROUTE_HANDLER_PROXY_WORKER_SHUTDOWN_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      sendRouteHandlerProxyWorkerRequest<RouteHandlerProxyWorkerShutdownResponse>(
        session,
        {
          requestId: createRouteHandlerProxyWorkerRequestId(),
          kind: 'shutdown'
        }
      ),
      shutdownTimeoutPromise
    ]);
  } finally {
    if (shutdownTimeoutHandle != null) {
      clearTimeout(shutdownTimeoutHandle);
    }
  }
};

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
  unregisterRouteHandlerProxyWorkerSession(workerSessions, session);

  if (session.shutdownPromise != null) {
    await session.shutdownPromise;
    return;
  }

  if (session.closed) {
    await session.terminationPromise;
    return;
  }

  debugRouteHandlerProxy('lazy-worker:shutdown-start', {
    reason,
    bootstrapGenerationToken: session.bootstrapGenerationToken
  });
  debugRouteHandlerProxy('lazy-worker:session-close', {
    reason,
    bootstrapGenerationToken: session.bootstrapGenerationToken
  });

  session.shutdownPromise = (async () => {
    try {
      const shutdownAcknowledgement =
        await waitForRouteHandlerProxyWorkerShutdownAcknowledgement(session);

      if (shutdownAcknowledgement === 'timeout') {
        debugRouteHandlerProxy('lazy-worker:shutdown-timeout', {
          reason,
          bootstrapGenerationToken: session.bootstrapGenerationToken
        });
        forceCloseRouteHandlerProxyWorkerSession(
          workerSessions,
          session,
          'shutdown-timeout'
        );
      }
    } catch (error) {
      debugRouteHandlerProxy('lazy-worker:shutdown-error', {
        reason,
        bootstrapGenerationToken: session.bootstrapGenerationToken,
        message: error instanceof Error ? error.message : String(error)
      });
      forceCloseRouteHandlerProxyWorkerSession(
        workerSessions,
        session,
        'shutdown-failed'
      );
    }

    await session.terminationPromise;

    debugRouteHandlerProxy('lazy-worker:shutdown-complete', {
      reason,
      bootstrapGenerationToken: session.bootstrapGenerationToken
    });
  })();

  await session.shutdownPromise;
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

  const child = spawn(process.execPath, workerArgv, {
    cwd: workerCwd,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: workerEnvironment
  });
  let resolveWorkerSessionTermination = (): void => {};
  const session: RouteHandlerProxyWorkerSession = {
    sessionKey,
    bootstrapGenerationToken,
    child,
    pendingRequests: new Map(),
    bootstrapPromise: Promise.resolve(),
    shutdownPromise: null,
    terminationPromise: new Promise(resolve => {
      resolveWorkerSessionTermination = resolve;
    }),
    resolveTermination: () => {
      resolveWorkerSessionTermination();
    },
    closed: false
  };
  const stderrChunks: Array<Buffer> = [];

  child.on('message', rawEnvelope => {
    try {
      const envelope = rawEnvelope as RouteHandlerProxyWorkerResponseEnvelope;
      const pendingRequest = session.pendingRequests.get(envelope.requestId);

      if (pendingRequest == null) {
        return;
      }

      session.pendingRequests.delete(envelope.requestId);

      if (envelope.ok) {
        pendingRequest.resolve(envelope.response);
        return;
      }

      pendingRequest.reject(new Error(envelope.error.message));
    } catch (error) {
      rejectRouteHandlerProxyWorkerSessionPendingRequests(
        session,
        error instanceof Error ? error : new Error(String(error))
      );
      forceCloseRouteHandlerProxyWorkerSession(
        workerSessions,
        session,
        'invalid-worker-response-envelope'
      );
    }
  });

  child.stderr?.on('data', chunk => {
    const normalizedChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    stderrChunks.push(normalizedChunk);
    debugRouteHandlerProxy('lazy-worker:stderr', {
      text: normalizedChunk.toString('utf8').trim()
    });
  });

  child.on('error', error => {
    rejectRouteHandlerProxyWorkerSessionPendingRequests(session, error);
    unregisterRouteHandlerProxyWorkerSession(workerSessions, session);
    session.closed = true;
    session.resolveTermination();
  });

  child.on('close', (exitCode, signal) => {
    unregisterRouteHandlerProxyWorkerSession(workerSessions, session);
    session.closed = true;
    session.resolveTermination();

    debugRouteHandlerProxy('lazy-worker:child-close', {
      exitCode,
      signal,
      bootstrapGenerationToken: session.bootstrapGenerationToken,
      pendingRequestCount: session.pendingRequests.size
    });

    if (session.pendingRequests.size === 0 && exitCode === 0) {
      return;
    }

    rejectRouteHandlerProxyWorkerSessionPendingRequests(
      session,
      createRouteHandlerProxyWorkerExitError(exitCode, stderrChunks)
    );
  });

  session.bootstrapPromise =
    sendRouteHandlerProxyWorkerRequest<RouteHandlerProxyWorkerBootstrapResponse>(
      session,
      {
        // Bootstrap carries the clear adapter-owned registration values the
        // worker needs to reload runtime attachments for this generation.
        requestId: createRouteHandlerProxyWorkerRequestId(),
        kind: 'bootstrap',
        bootstrapGenerationToken,
        localeConfig,
        configRegistration
      }
    ).then(response => {
      if (
        response.kind !== 'bootstrapped' ||
        response.bootstrapGenerationToken !== bootstrapGenerationToken
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
  const sessionKey =
    createRouteHandlerProxyWorkerSessionKey(configRegistration);
  const existingSession = workerSessions.get(sessionKey);

  if (
    existingSession != null &&
    existingSession.bootstrapGenerationToken === bootstrapGenerationToken
  ) {
    await existingSession.bootstrapPromise;
    return existingSession;
  }

  if (existingSession != null) {
    await shutdownRouteHandlerProxyWorkerSessionGracefully({
      workerSessions,
      session: existingSession,
      reason: 'bootstrap-generation-changed'
    });
  }

  const session = createRouteHandlerProxyWorkerSession({
    workerSessions,
    localeConfig,
    bootstrapGenerationToken,
    configRegistration
  });
  workerSessions.set(sessionKey, session);

  try {
    await session.bootstrapPromise;
  } catch (error) {
    forceCloseRouteHandlerProxyWorkerSession(
      workerSessions,
      session,
      'bootstrap-failed'
    );
    throw error;
  }

  return session;
};
