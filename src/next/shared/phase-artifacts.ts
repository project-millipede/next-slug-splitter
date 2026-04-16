import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { clearRouteHandlerOutputDirectory } from '../../generator/shared/protocol/output-lifecycle';
import {
  isObjectRecordOf,
  readObjectProperty
} from '../../utils/type-guards-custom';

import type { ResolvedRouteHandlersConfigBase } from './types';

type RouteHandlerPhaseArtifactConfig = Pick<
  ResolvedRouteHandlersConfigBase,
  'app' | 'paths'
>;

const ROUTE_HANDLER_PHASE_RECORD_VERSION = 1;

/**
 * Direct JSON artifacts written by next-slug-splitter itself.
 *
 * These paths point to one-file JSON documents whose serialization format is
 * owned directly by this codebase.
 *
 * Producers:
 * - `ROUTE_HANDLER_PHASE_RECORD_PATH` is written by
 *   `writeRouteHandlerPhaseOwner(...)` in this module
 * - `PROXY_BOOTSTRAP_MANIFEST_PATH` is written by
 *   `writeRouteHandlerProxyBootstrap(...)` in `bootstrap-persisted.ts`
 */
const ROUTE_HANDLER_PHASE_RECORD_PATH = path.join(
  '.next',
  'cache',
  'route-handlers-phase-owner.json'
);
const PROXY_BOOTSTRAP_MANIFEST_PATH = path.join(
  '.next',
  'cache',
  'route-handlers-worker-bootstrap.json'
);

/**
 * Cache directories whose on-disk layout is owned by a cache helper.
 *
 * This path is storage for persisted one-file route-plan records managed by
 * `file-entry-cache`, not one directly serialized JSON artifact.
 *
 * Producer:
 * - `DEV_LAZY_SINGLE_ROUTE_CACHE_DIRECTORY` is used by
 *   `createLazySingleRouteFileCache(...)` in `single-route-cache.ts`
 */
const DEV_LAZY_SINGLE_ROUTE_CACHE_DIRECTORY = path.join(
  '.next',
  'cache',
  'route-handlers-lazy-single-routes'
);

type RouteHandlerPhaseOwner = 'dev' | 'build';

type RouteHandlerPhaseRecord = {
  version: number;
  phase: RouteHandlerPhaseOwner;
};

const resolveRouteHandlerPhaseRecordPath = (rootDir: string): string =>
  path.join(rootDir, ROUTE_HANDLER_PHASE_RECORD_PATH);

const isRouteHandlerPhaseRecord = (
  value: unknown
): value is RouteHandlerPhaseRecord => {
  if (!isObjectRecordOf<RouteHandlerPhaseRecord>(value)) {
    return false;
  }

  const phase = readObjectProperty(value, 'phase');

  return (
    readObjectProperty(value, 'version') === ROUTE_HANDLER_PHASE_RECORD_VERSION &&
    (phase === 'dev' || phase === 'build')
  );
};

const readRouteHandlerPhaseOwner = async (
  rootDir: string
): Promise<RouteHandlerPhaseOwner | null> => {
  try {
    const raw = await readFile(resolveRouteHandlerPhaseRecordPath(rootDir), 'utf8');
    const parsed = JSON.parse(raw);

    return isRouteHandlerPhaseRecord(parsed) ? parsed.phase : null;
  } catch {
    return null;
  }
};

const writeRouteHandlerPhaseOwner = async (
  rootDir: string,
  phase: RouteHandlerPhaseOwner
): Promise<void> => {
  const recordPath = resolveRouteHandlerPhaseRecordPath(rootDir);
  const record: RouteHandlerPhaseRecord = {
    version: ROUTE_HANDLER_PHASE_RECORD_VERSION,
    phase
  };

  await mkdir(path.dirname(recordPath), {
    recursive: true
  });
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
};

const clearRouteHandlerProxyBootstrapManifest = async (
  rootDir: string
): Promise<void> => {
  await rm(path.join(rootDir, PROXY_BOOTSTRAP_MANIFEST_PATH), {
    recursive: true,
    force: true
  });
};

const clearDevLazySingleRouteCacheArtifacts = async (
  rootDir: string
): Promise<void> => {
  await rm(path.join(rootDir, DEV_LAZY_SINGLE_ROUTE_CACHE_DIRECTORY), {
    recursive: true,
    force: true
  });
};

/**
 * Enforce phase-local ownership of emitted handlers and cache artifacts.
 *
 * @remarks
 * We intentionally preserve one cross-restart dev cache: the persisted
 * one-file route-plan records under `.next/cache/route-handlers-lazy-single-routes`.
 * That reuse is only safe when the previous owning phase was also `dev`.
 *
 * Transition rules:
 * 1. The proxy bootstrap manifest is cleared before the current phase writes
 *    fresh structural worker state.
 * 2. Entering `build` clears dev-only lazy route-plan cache artifacts so build
 *    never reads or validates dev cache state.
 * 3. Entering `dev` after any non-dev owner clears both dev-only route-plan
 *    cache artifacts and emitted handler directories so dev never trusts prior
 *    build-emitted handler files in the shared generated handler tree.
 * 4. Entering `dev` after a previous `dev` owner preserves handler files and
 *    the route-plan cache so revisiting the same heavy route can skip both
 *    analysis and regeneration across dev restarts.
 *
 * @param resolvedConfigs - Structural target configs for the current run.
 * @param phase - Owning phase that should claim the shared artifacts.
 * @returns A promise that settles after all phase-local cleanup is complete.
 */
export const synchronizeRouteHandlerPhaseArtifacts = async (
  resolvedConfigs: Array<RouteHandlerPhaseArtifactConfig>,
  phase: RouteHandlerPhaseOwner
): Promise<void> => {
  const [referenceConfig] = resolvedConfigs;

  if (referenceConfig == null) {
    return;
  }

  const rootDir = referenceConfig.app.rootDir;
  const previousPhase = await readRouteHandlerPhaseOwner(rootDir);

  await clearRouteHandlerProxyBootstrapManifest(rootDir);

  if (phase === 'build') {
    await clearDevLazySingleRouteCacheArtifacts(rootDir);
  } else if (previousPhase !== 'dev') {
    await clearDevLazySingleRouteCacheArtifacts(rootDir);

    const handlersDirs = new Set(
      resolvedConfigs.map(config => config.paths.handlersDir)
    );

    for (const handlersDir of handlersDirs) {
      await clearRouteHandlerOutputDirectory(handlersDir);
    }
  }

  await writeRouteHandlerPhaseOwner(rootDir, phase);
};
