import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { debugRouteHandlerProxy } from '../observability/debug-log';

import type {
  RouteHandlerProxyWorkerRequest,
  RouteHandlerProxyWorkerResponse
} from './types';
import type { LocaleConfig } from '../../../core/types';
import type { RouteHandlerProxyOptions } from '../runtime/types';

const SLUG_SPLITTER_CONFIG_PATH_ENV = 'SLUG_SPLITTER_CONFIG_PATH';
const SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV = 'SLUG_SPLITTER_CONFIG_ROOT_DIR';
const EXPERIMENTAL_STRIP_TYPES_FLAG = '--experimental-strip-types';

const inFlightLazyMissResolutions = new Map<
  string,
  Promise<RouteHandlerProxyWorkerResponse>
>();
const cachedLazyMissResolutions = new Map<
  string,
  {
    expiresAt: number;
    response: Extract<
      RouteHandlerProxyWorkerResponse,
      {
        kind: 'heavy';
      }
    >;
  }
>();

const ROUTE_HANDLER_PROXY_WORKER_CACHE_TTL_MS = 10_000;

/**
 * Read one still-fresh settled worker result from the process-local cache.
 *
 * @param dedupeKey - Stable cache key for the current pathname/config pair.
 * @returns Cached heavy response when still fresh, otherwise `null`.
 *
 * @remarks
 * The main proxy runtime currently cannot hold a fully resolved routing-state
 * snapshot in-process because Next's special Proxy module graph rejects the
 * dynamic app-config imports that ordinary Node code would allow.
 *
 * That means even already-seen heavy routes can otherwise keep paying the
 * worker spawn cost on every re-entry, including incidental `HEAD
 * /_next/data/...` validation traffic from the Next client router.
 *
 * This short-lived cache is a deliberately conservative bridge:
 * - process-local only
 * - heavy-route results only
 * - bounded TTL
 *
 * It does not try to become a second long-lived source of truth. It simply
 * keeps obviously warm heavy routes from feeling slow during active dev
 * navigation.
 */
const readRouteHandlerProxyWorkerCachedResolution = (
  dedupeKey: string
): Extract<RouteHandlerProxyWorkerResponse, { kind: 'heavy' }> | null => {
  const cachedResolution = cachedLazyMissResolutions.get(dedupeKey);

  if (cachedResolution == null) {
    return null;
  }

  if (cachedResolution.expiresAt <= Date.now()) {
    cachedLazyMissResolutions.delete(dedupeKey);
    return null;
  }

  return cachedResolution.response;
};

/**
 * Publish one settled heavy worker result into the short-lived process-local
 * cache.
 *
 * @param input - Cache publication input.
 * @param input.dedupeKey - Stable cache key for the pathname/config pair.
 * @param input.response - Settled worker response.
 *
 * @remarks
 * Heavy results are cached conservatively for a short time so obviously warm
 * routes do not keep paying worker spawn cost during active dev navigation.
 */
const publishRouteHandlerProxyWorkerCachedResolution = ({
  dedupeKey,
  response
}: {
  dedupeKey: string;
  response: RouteHandlerProxyWorkerResponse;
}): void => {
  if (response.kind !== 'heavy') {
    return;
  }

  cachedLazyMissResolutions.set(dedupeKey, {
    expiresAt: Date.now() + ROUTE_HANDLER_PROXY_WORKER_CACHE_TTL_MS,
    response
  });
};

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
  configRegistration?: RouteHandlerProxyOptions['configRegistration']
): {
  configPath?: string;
  rootDir?: string;
} => ({
  configPath:
    configRegistration?.configPath ??
    process.env[SLUG_SPLITTER_CONFIG_PATH_ENV],
  rootDir:
    configRegistration?.rootDir ??
    process.env[SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV]
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
const resolveRouteHandlerProxyWorkerEntryPath = ({
  configRegistration
}: {
  configRegistration?: RouteHandlerProxyOptions['configRegistration'];
}): string => {
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
 *
 * @remarks
 * The main Next process can already evaluate the app's TS config as part of
 * its own toolchain. The dev-only lazy worker is different: it is a brand-new
 * child Node process that loads the registered config path directly from disk.
 *
 * When the app registered `route-handlers-config.ts`, that fresh child process
 * must opt into Node's strip-types support or the worker would fail before it
 * even reaches any proxy logic. Keeping this detection here makes the boundary
 * explicit and avoids baking TS-loader assumptions into the worker entrypoint
 * itself.
 */
const shouldUseRouteHandlerProxyWorkerStripTypes = ({
  configRegistration
}: {
  configRegistration?: RouteHandlerProxyOptions['configRegistration'];
}): boolean => {
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
 *
 * @remarks
 * This worker is development-only and exists specifically so the main proxy
 * bundle does not import the heavy MDX/esbuild graph. Because it is a true
 * process boundary, it no longer inherits the parent process' in-memory config
 * registry or any TS-aware module loader state. The launch contract therefore
 * has to be explicit about how app-owned TS config files are loaded.
 */
const resolveRouteHandlerProxyWorkerArgv = ({
  configRegistration
}: {
  configRegistration?: RouteHandlerProxyOptions['configRegistration'];
}): string[] => {
  const workerEntryPath = resolveRouteHandlerProxyWorkerEntryPath({
    configRegistration
  });

  if (
    !shouldUseRouteHandlerProxyWorkerStripTypes({
      configRegistration
    })
  ) {
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
 *
 * @remarks
 * The worker loads the app-owned config file inside a fresh Node process. Many
 * existing app configs compute values like `rootDir = process.cwd()` during
 * module evaluation. If the worker inherited the library package cwd instead of
 * the true app root, those config-time calculations would silently point at
 * the wrong project and every later path resolution would drift.
 *
 * We therefore prefer the app root captured at `withSlugSplitter(...)`
 * registration time. Falling back to the config file directory still gives a
 * sensible best-effort cwd for direct/integration tests that only registered a
 * config path.
 */
const resolveRouteHandlerProxyWorkerCwd = ({
  configRegistration
}: {
  configRegistration?: RouteHandlerProxyOptions['configRegistration'];
}): string => {
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
 *
 * @remarks
 * In the Next Proxy runtime, `process.env` can behave like a special runtime
 * view instead of a plain eagerly materialized object. The parent Proxy
 * process can still read individual keys from that view, but passing the view
 * object through to `spawn(...)` is not guaranteed to preserve ad-hoc
 * registration keys such as `SLUG_SPLITTER_CONFIG_PATH`.
 *
 * The lazy worker depends on those exact registration keys to find the
 * app-owned config file and root directory, so we eagerly copy the environment
 * into a plain object and then pin the two critical keys explicitly.
 */
const createRouteHandlerProxyWorkerEnvironment = ({
  configRegistration
}: {
  configRegistration?: RouteHandlerProxyOptions['configRegistration'];
}): NodeJS.ProcessEnv => {
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
 * Execute one single-shot proxy worker request.
 *
 * @param request - Serialized worker request.
 * @returns Serialized worker response.
 *
 * @remarks
 * The proxy runtime intentionally talks to the worker through a real child
 * process instead of another imported module. That is the whole point of this
 * boundary: keep the heavy lazy stack out of Next's proxy module graph.
 */
const executeRouteHandlerProxyWorker = (
  request: RouteHandlerProxyWorkerRequest,
  options?: {
    configRegistration?: RouteHandlerProxyOptions['configRegistration'];
  }
): Promise<RouteHandlerProxyWorkerResponse> =>
  new Promise((resolve, reject) => {
    const workerArgv = resolveRouteHandlerProxyWorkerArgv({
      configRegistration: options?.configRegistration
    });
    const workerCwd = resolveRouteHandlerProxyWorkerCwd({
      configRegistration: options?.configRegistration
    });
    const workerEnvironment = createRouteHandlerProxyWorkerEnvironment({
      configRegistration: options?.configRegistration
    });

    debugRouteHandlerProxy('lazy-worker:spawn', {
      pathname: request.pathname,
      cwd: workerCwd,
      argv: workerArgv,
      hasConfigPath:
        typeof workerEnvironment[SLUG_SPLITTER_CONFIG_PATH_ENV] === 'string',
      hasRootDir:
        typeof workerEnvironment[SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV] === 'string'
    });

    const child = spawn(process.execPath, workerArgv, {
      cwd: workerCwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: workerEnvironment
    });
    const stdoutChunks: Array<Buffer> = [];
    const stderrChunks: Array<Buffer> = [];

    child.stdout.on('data', chunk => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on('data', chunk => {
      const normalizedChunk = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk);

      stderrChunks.push(normalizedChunk);
      debugRouteHandlerProxy('lazy-worker:stderr', {
        pathname: request.pathname,
        text: normalizedChunk.toString('utf8').trim()
      });
    });
    child.on('error', reject);
    child.on('close', exitCode => {
      if (exitCode !== 0) {
        reject(
          new Error(
            `next-slug-splitter proxy worker exited with code ${String(
              exitCode
            )}: ${Buffer.concat(stderrChunks).toString('utf8')}`
          )
        );
        return;
      }

      try {
        resolve(
          JSON.parse(
            Buffer.concat(stdoutChunks).toString('utf8')
          ) as RouteHandlerProxyWorkerResponse
        );
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(JSON.stringify(request));
  });

/**
 * Resolve one proxy lazy miss through the dedicated worker process.
 *
 * @param input - Worker client input.
 * @param input.pathname - Public pathname that missed the stable routing state.
 * @param input.localeConfig - Locale config captured by the generated root proxy.
 * @returns Semantic lazy-miss outcome.
 *
 * @remarks
 * This client keeps one small in-process dedupe map so concurrent misses for
 * the same pathname share a single worker request instead of spawning several
 * identical child processes.
 */
export const resolveRouteHandlerProxyLazyMissWithWorker = async ({
  pathname,
  localeConfig,
  configRegistration
}: {
  pathname: string;
  localeConfig: LocaleConfig;
  configRegistration?: RouteHandlerProxyOptions['configRegistration'];
}): Promise<RouteHandlerProxyWorkerResponse> => {
  const dedupeKey = JSON.stringify([
    pathname,
    localeConfig,
    configRegistration?.configPath ?? null,
    configRegistration?.rootDir ?? null
  ]);
  const existingResolution = inFlightLazyMissResolutions.get(dedupeKey);

  if (existingResolution != null) {
    return existingResolution;
  }

  const cachedResolution =
    readRouteHandlerProxyWorkerCachedResolution(dedupeKey);

  if (cachedResolution != null) {
    debugRouteHandlerProxy('lazy-worker:cache-hit', {
      pathname,
      rewriteDestination: cachedResolution.rewriteDestination,
      source: cachedResolution.source
    });
    return cachedResolution;
  }

  const resolutionPromise = executeRouteHandlerProxyWorker(
    {
      kind: 'resolve-lazy-miss',
      pathname,
      localeConfig
    },
    {
      configRegistration
    }
  )
    .then(response => {
      publishRouteHandlerProxyWorkerCachedResolution({
        dedupeKey,
        response
      });

      if (response.kind === 'heavy') {
        debugRouteHandlerProxy('lazy-worker:cache-store', {
          pathname,
          rewriteDestination: response.rewriteDestination,
          source: response.source,
          ttlMs: ROUTE_HANDLER_PROXY_WORKER_CACHE_TTL_MS
        });
      }

      return response;
    })
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
