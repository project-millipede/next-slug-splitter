import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { debugRouteHandlerProxy } from '../observability/debug-log';

import type { LocaleConfig } from '../../../core/types';
import type {
  BootstrapGenerationToken,
  RouteHandlerProxyConfigRegistration
} from '../runtime/types';
import type {
  RouteHandlerProxyWorkerBootstrapResponse,
  RouteHandlerProxyWorkerRequest,
  RouteHandlerProxyWorkerResponse,
  RouteHandlerProxyWorkerResponseEnvelope,
  RouteHandlerProxyWorkerSessionInput
} from './types';

const SLUG_SPLITTER_CONFIG_PATH_ENV = 'SLUG_SPLITTER_CONFIG_PATH';
const SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV = 'SLUG_SPLITTER_CONFIG_ROOT_DIR';
const EXPERIMENTAL_STRIP_TYPES_FLAG = '--experimental-strip-types';

// Cache-policy note: `workerSessions` and `inFlightLazyMissResolutions` are
// intentionally separate layers. `workerSessions` keeps one long-lived child
// process alive, while `inFlightLazyMissResolutions` collapses overlapping
// identical parent requests so they are not both sent into that session. See
// `docs/architecture/cache-policy.md`.
const inFlightLazyMissResolutions = new Map<
  string,
  Promise<RouteHandlerProxyWorkerResponse>
>();
const workerSessions = new Map<string, RouteHandlerProxyWorkerSession>();

let routeHandlerProxyWorkerRequestSequence = 0;

/**
 * Resolve the explicit config registration this proxy request wants the worker
 * to use.
 *
 * @param configRegistration - Adapter-time registration forwarded by the
 * generated root Proxy file.
 * @returns Normalized registration values with environment fallback.
 *
 * @remarks
 * The explicit request options are the preferred source of truth. Environment
 * fallback still exists for tests and older integration edges, but the real
 * production of these values should happen at adapter time and travel through
 * the generated `proxy.ts` bridge.
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
 * @returns Absolute worker bundle path.
 *
 * @remarks
 * This path resolution must stay purely filesystem-based. Even a seemingly
 * harmless module-style lookup such as `require.resolve('./proxy-lazy-worker')`
 * gives Turbopack a concrete module edge from the thin Proxy bundle into the
 * heavy worker bundle, which is exactly what we must avoid. The worker file is
 * a sibling artifact on disk, so we resolve it like one.
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
    'proxy-lazy-worker.js'
  );
};

/**
 * Determine whether the app-owned config path requires Node's built-in
 * type-stripping loader.
 *
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

type RouteHandlerProxyWorkerPendingRequest = {
  resolve: (
    response:
      | RouteHandlerProxyWorkerBootstrapResponse
      | RouteHandlerProxyWorkerResponse
  ) => void;
  reject: (error: Error) => void;
};

type RouteHandlerProxyWorkerSession = {
  sessionKey: string;
  bootstrapGenerationToken: BootstrapGenerationToken;
  child: ReturnType<typeof spawn>;
  pendingRequests: Map<string, RouteHandlerProxyWorkerPendingRequest>;
  bootstrapPromise: Promise<void>;
  closed: boolean;
};

const createRouteHandlerProxyWorkerRequestId = (): string =>
  `route-handler-proxy-worker-request-${String(
    ++routeHandlerProxyWorkerRequestSequence
  )}`;

/**
 * Resolve the stable parent-side session key.
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
 * Reject every still-pending request on one worker session.
 *
 * @param session - Worker session whose pending requests should fail.
 * @param error - Shared error surfaced to callers.
 */
const rejectRouteHandlerProxyWorkerSessionPendingRequests = (
  session: RouteHandlerProxyWorkerSession,
  error: Error
): void => {
  for (const pendingRequest of session.pendingRequests.values()) {
    pendingRequest.reject(error);
  }

  session.pendingRequests.clear();
};

/**
 * Write one request into the persistent worker session.
 *
 * @param session - Worker session that should receive the request.
 * @param request - Serialized worker request payload.
 * @returns One typed worker response.
 *
 * @remarks
 * Request-send aspects:
 * - Transport: requests travel over the child IPC channel, not stdin.
 * - Correlation: pending promises are keyed by request id until one matching
 *   response arrives.
 * - Failure mode: a missing IPC channel is treated as a session-level
 *   contract violation.
 */
const sendRouteHandlerProxyWorkerRequest = <
  TResponse extends
    | RouteHandlerProxyWorkerBootstrapResponse
    | RouteHandlerProxyWorkerResponse
>(
  session: RouteHandlerProxyWorkerSession,
  request: RouteHandlerProxyWorkerRequest
): Promise<TResponse> =>
  new Promise((resolve, reject) => {
    if (session.closed) {
      reject(new Error('next-slug-splitter proxy worker session is closed.'));
      return;
    }

    if (typeof session.child.send !== 'function') {
      reject(new Error('next-slug-splitter proxy worker IPC is unavailable.'));
      return;
    }

    session.pendingRequests.set(request.requestId, {
      resolve: response => {
        resolve(response as TResponse);
      },
      reject
    });

    session.child.send(request, error => {
      if (error == null) {
        return;
      }

      session.pendingRequests.delete(request.requestId);
      reject(error);
    });
  });

/**
 * Tear down one worker session and remove it from the registry if still owned.
 *
 * @param session - Worker session being closed.
 * @param reason - Diagnostic reason recorded for the close event.
 *
 * @remarks
 * Close aspects:
 * - Registry ownership is checked before removing the session entry.
 * - Closing is idempotent so repeated teardown paths stay harmless.
 * - Process termination is delegated to the child after local state is marked
 *   closed.
 */
const closeRouteHandlerProxyWorkerSession = (
  session: RouteHandlerProxyWorkerSession,
  reason: string
): void => {
  if (workerSessions.get(session.sessionKey) === session) {
    workerSessions.delete(session.sessionKey);
  }

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
 * Spawn and bootstrap one persistent worker session.
 *
 * @param input - Session-creation input.
 * @param input.localeConfig - Locale semantics for the current worker generation.
 * @param input.bootstrapGenerationToken - Parent-issued bootstrap generation token.
 * @param input.configRegistration - Adapter-time config registration.
 * @returns Persistent worker session for one bootstrap generation.
 *
 * @remarks
 * Session-creation aspects:
 * - Transport: the child is spawned with an IPC channel in addition to stderr
 *   and stdout pipes.
 * - Bootstrap: the parent immediately sends a bootstrap request before the
 *   session is considered ready.
 * - Diagnostics: stderr is still collected for error surfacing and debug
 *   logging, but it is not part of the request protocol.
 */
const createRouteHandlerProxyWorkerSession = ({
  localeConfig,
  bootstrapGenerationToken,
  configRegistration
}: RouteHandlerProxyWorkerSessionInput): RouteHandlerProxyWorkerSession => {
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
  const session: RouteHandlerProxyWorkerSession = {
    sessionKey,
    bootstrapGenerationToken,
    child,
    pendingRequests: new Map(),
    bootstrapPromise: Promise.resolve(),
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
      closeRouteHandlerProxyWorkerSession(
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

    if (workerSessions.get(sessionKey) === session) {
      workerSessions.delete(sessionKey);
    }

    session.closed = true;
  });

  child.on('close', exitCode => {
    if (workerSessions.get(sessionKey) === session) {
      workerSessions.delete(sessionKey);
    }

    session.closed = true;

    if (session.pendingRequests.size === 0 && exitCode === 0) {
      return;
    }

    rejectRouteHandlerProxyWorkerSessionPendingRequests(
      session,
      new Error(
        `next-slug-splitter proxy worker exited with code ${String(
          exitCode
        )}: ${Buffer.concat(stderrChunks).toString('utf8')}`
      )
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
 * @param input - Session-resolution input.
 * @param input.localeConfig - Locale semantics for the current worker generation.
 * @param input.bootstrapGenerationToken - Parent-issued bootstrap generation token.
 * @param input.configRegistration - Adapter-time config registration.
 * @returns Ready worker session for the current generation.
 *
 * @remarks
 * Resolution aspects:
 * - Reuse: an existing session is reused only when the generation token still
 *   matches.
 * - Restart: generation changes force a full session restart and re-bootstrap.
 * - Readiness: callers await bootstrap completion before using the session.
 */
const resolveRouteHandlerProxyWorkerSession = async ({
  localeConfig,
  bootstrapGenerationToken,
  configRegistration
}: RouteHandlerProxyWorkerSessionInput): Promise<RouteHandlerProxyWorkerSession> => {
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
    closeRouteHandlerProxyWorkerSession(
      existingSession,
      'bootstrap-generation-changed'
    );
  }

  const session = createRouteHandlerProxyWorkerSession({
    localeConfig,
    bootstrapGenerationToken,
    configRegistration
  });
  workerSessions.set(sessionKey, session);

  try {
    await session.bootstrapPromise;
  } catch (error) {
    closeRouteHandlerProxyWorkerSession(session, 'bootstrap-failed');
    throw error;
  }

  return session;
};

/**
 * Clear all persistent worker client state.
 *
 * @remarks
 * Cleanup aspects:
 * - Tests use this to isolate worker-session state.
 * - Explicit refresh work can reuse the same teardown path later.
 * - Every known session is closed through the normal lifecycle helper.
 */
export const clearRouteHandlerProxyWorkerClientSessions = (): void => {
  for (const session of workerSessions.values()) {
    closeRouteHandlerProxyWorkerSession(session, 'client-clear');
  }

  workerSessions.clear();
  inFlightLazyMissResolutions.clear();
  routeHandlerProxyWorkerRequestSequence = 0;
};

/**
 * Resolve one proxy lazy miss through the dedicated persistent worker session.
 *
 * @param input - Worker client input.
 * @param input.pathname - Public pathname that missed the stable routing state.
 * @param input.localeConfig - Locale config captured by the generated root proxy.
 * @param input.bootstrapGenerationToken - Current bootstrap generation token from the parent runtime.
 * @returns Semantic lazy-miss outcome.
 *
 * @remarks
 * This client keeps only in-flight dedupe in the parent process. Warm reuse
 * now comes from keeping the worker session itself alive across revisits while
 * the bootstrap generation remains unchanged.
 */
export const resolveRouteHandlerProxyLazyMissWithWorker = async ({
  pathname,
  localeConfig,
  bootstrapGenerationToken,
  configRegistration = {}
}: {
  pathname: string;
  localeConfig: LocaleConfig;
  bootstrapGenerationToken: BootstrapGenerationToken;
  configRegistration?: RouteHandlerProxyConfigRegistration;
}): Promise<RouteHandlerProxyWorkerResponse> => {
  const dedupeKey = JSON.stringify([
    pathname,
    localeConfig,
    bootstrapGenerationToken,
    configRegistration.configPath ?? null,
    configRegistration.rootDir ?? null
  ]);
  const existingResolution = inFlightLazyMissResolutions.get(dedupeKey);

  if (existingResolution != null) {
    return existingResolution;
  }

  const resolutionPromise = resolveRouteHandlerProxyWorkerSession({
    localeConfig,
    bootstrapGenerationToken,
    configRegistration
  })
    .then(session =>
      sendRouteHandlerProxyWorkerRequest<RouteHandlerProxyWorkerResponse>(
        session,
        {
          requestId: createRouteHandlerProxyWorkerRequestId(),
          kind: 'resolve-lazy-miss',
          pathname
        }
      )
    )
    .catch(error => {
      debugRouteHandlerProxy('lazy-worker:error', {
        pathname,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    })
    .finally(() => {
      inFlightLazyMissResolutions.delete(dedupeKey);
    });

  inFlightLazyMissResolutions.set(dedupeKey, resolutionPromise);
  return resolutionPromise;
};
