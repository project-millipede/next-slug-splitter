/**
 * Target-local incremental planning cache.
 *
 * @remarks
 * This module is the heart of the "incremental analysis reuse" work. Its job
 * is to keep one target's route-planning state reusable across runs at file
 * granularity.
 *
 * Conceptually this subsystem has three layers:
 * - target identity:
 *   a static hash derived from non-content inputs such as processor identity,
 *   MDX options, and target configuration
 * - per-file route records:
 *   persisted planned-route results stored in `file-entry-cache` metadata
 * - target snapshot:
 *   a tiny sidecar record that remembers which route files belonged to the
 *   target when the current static identity was last computed
 *
 * Consumer-facing runtime code reaches this module from `executeRouteHandlerTarget`.
 * By the time that happens, configuration has already been resolved and any
 * preparation tasks have already had a chance to run. This module therefore
 * focuses only on one question: which route files truly need to be re-planned?
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import fileEntryCache, {
  type FileEntryCache,
  type FileDescriptor
} from 'file-entry-cache';

import { discoverLocalizedContentRoutes } from '../../../core/discovery';
import { createRouteHandlerRoutePlanner } from '../../../core/processor-runner';
import type {
  LocalizedRoutePath,
  PlannedHeavyRoute,
  RouteHandlerPipelineResult
} from '../../../core/types';
import { createCacheError } from '../../../utils/errors';
import { isString } from '../../../utils/type-guards';
import {
  isObjectRecordOf,
  isStringArray,
  readObjectProperty
} from '../../../utils/type-guards-custom';
import { computeTargetStaticCacheIdentity } from '../../cache';
import {
  createPersistedRoutePlanRecord,
  readPersistedRoutePlanRecord,
  type PersistedRoutePlanRecord
} from './route-plan-record';

import type { ResolvedRouteHandlersConfig } from '../../types';

const TARGET_CACHE_DIRECTORY = path.join(
  '.next',
  'cache',
  'route-handlers-targets'
);

/**
 * Version markers for the two persisted artifacts owned by this module.
 *
 * @remarks
 * We persist two different structures:
 * - one snapshot file per target, which records target identity plus the last
 *   observed route-file membership
 * - one per-file record inside `file-entry-cache`, which stores the computed
 *   planning result for a single route file
 *
 * Keeping version numbers explicit lets us invalidate only this subsystem's
 * data shape without needing to touch unrelated cache files.
 */
const TARGET_CACHE_SNAPSHOT_VERSION = 1;
/**
 * Persisted planning unit for one content file.
 *
 * @remarks
 * `plannedHeavyRoute: null` is meaningful here. It means the file was analyzed
 * and determined not to require a generated handler, which is still useful
 * cached knowledge. We store that negative result so unchanged light routes do
 * not need to be re-analyzed on every run.
 */
type CachedRoutePlanRecord = PersistedRoutePlanRecord;

/**
 * Small sidecar snapshot for one target's current non-content identity.
 *
 * @remarks
 * This snapshot does not duplicate all planned route data. Its purpose is much
 * narrower:
 * - remember which files were part of the target when the cache was last saved
 * - remember which target-level static identity those file records belong to
 *
 * That is exactly the information needed to decide:
 * - whether every per-file record must be discarded because target inputs
 *   changed
 * - which previously known files have disappeared and must be removed from the
 *   per-file cache
 */
type TargetCacheSnapshot = {
  version: number;
  identity: string;
  routeFilePaths: Array<string>;
  updatedAt: string;
};

/**
 * Target IDs are used in cache filenames, so we normalize them to a filesystem-
 * safe representation up front.
 */
const sanitizeTargetId = (targetId: string): string =>
  targetId.replace(/[^a-zA-Z0-9_-]/g, '-');

/**
 * Resolve the root directory used by this module's target-local cache group.
 */
const resolveTargetCacheDirectory = (rootDir: string): string =>
  path.resolve(rootDir, TARGET_CACHE_DIRECTORY);

/**
 * Resolve the sidecar snapshot path for one target.
 */
const resolveTargetSnapshotPath = ({
  rootDir,
  targetId
}: {
  rootDir: string;
  targetId: string;
}): string =>
  path.join(
    resolveTargetCacheDirectory(rootDir),
    `${sanitizeTargetId(targetId)}.json`
  );

/**
 * Create the `file-entry-cache` instance that owns per-file planning records.
 *
 * @remarks
 * Important settings:
 * - `useAbsolutePathAsKey: true`
 *   keeps entries stable even when callers hand us fully resolved file paths
 * - `useCheckSum: true`
 *   makes change detection content-aware rather than relying only on mtimes
 * - `restrictAccessToCwd: false`
 *   lets the cache operate safely with absolute-path keys inside the app root
 */
const createTargetFileCache = ({
  rootDir,
  targetId
}: {
  rootDir: string;
  targetId: string;
}): FileEntryCache =>
  fileEntryCache.create(
    `route-handlers-${sanitizeTargetId(targetId)}`,
    resolveTargetCacheDirectory(rootDir),
    {
      cwd: rootDir,
      restrictAccessToCwd: false,
      useAbsolutePathAsKey: true,
      useCheckSum: true,
      useModifiedTime: true,
      hashAlgorithm: 'sha256'
    }
  );

const isTargetCacheSnapshot = (
  value: unknown
): value is TargetCacheSnapshot => {
  if (!isObjectRecordOf<TargetCacheSnapshot>(value)) {
    return false;
  }

  return (
    readObjectProperty(value, 'version') === TARGET_CACHE_SNAPSHOT_VERSION &&
    isString(readObjectProperty(value, 'identity')) &&
    isStringArray(readObjectProperty(value, 'routeFilePaths')) &&
    isString(readObjectProperty(value, 'updatedAt'))
  );
};

const readTargetCacheSnapshot = async (
  snapshotPath: string
): Promise<TargetCacheSnapshot | null> => {
  // Snapshot files are rebuildable. Any read/parse failure is treated as a
  // soft miss so the target can self-heal on the next execution.
  try {
    const raw = await readFile(snapshotPath, 'utf8');
    const parsed = JSON.parse(raw);
    return isTargetCacheSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeTargetCacheSnapshot = async ({
  snapshotPath,
  snapshot
}: {
  snapshotPath: string;
  snapshot: TargetCacheSnapshot;
}): Promise<void> => {
  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await writeFile(
    snapshotPath,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    'utf8'
  );
};

/**
 * Clear every persisted per-file route-plan record for a target.
 *
 * @remarks
 * This is the blunt invalidation path used when the target's static identity
 * no longer matches. In that situation we intentionally prefer correctness over
 * reuse because every stored record may have been computed under the wrong
 * processor, MDX options, or target-level configuration.
 */
const clearTargetFileCache = (cache: FileEntryCache): void => {
  for (const descriptor of cache.normalizeEntries()) {
    cache.removeEntry(descriptor.key);
  }
};

const toCachedRoutePlanRecord = async ({
  routePath,
  config,
  planRoute
}: {
  routePath: LocalizedRoutePath;
  config: ResolvedRouteHandlersConfig;
  planRoute: Awaited<ReturnType<typeof createRouteHandlerRoutePlanner>>;
}): Promise<CachedRoutePlanRecord> => {
  // The target-wide cache reuses the shared one-file persisted-record helper so
  // the exact same route-file planning semantics can also power the lazy
  // single-route proxy path without code drift.
  return createPersistedRoutePlanRecord({
    routePath,
    config,
    planRoute
  });
};

const getCachedRoutePlanRecord = (
  descriptor: FileDescriptor
): CachedRoutePlanRecord | null => {
  // `file-entry-cache` gives us arbitrary metadata storage on each descriptor.
  // We narrow that metadata back into our persisted record shape here.
  const cachedData = descriptor.meta.data;
  return readPersistedRoutePlanRecord(cachedData);
};

const buildPipelineResultFromCachedRecords = ({
  routePaths,
  routeRecordsByFilePath
}: {
  routePaths: Array<LocalizedRoutePath>;
  routeRecordsByFilePath: Map<string, CachedRoutePlanRecord>;
}): RouteHandlerPipelineResult => {
  // This is the reassembly step of the target-local cache group. Once every
  // current route file has either a reused record or a freshly recomputed one,
  // the pipeline result can be rebuilt deterministically from those records.
  const heavyRoutes: Array<PlannedHeavyRoute> = [];

  for (const routePath of routePaths) {
    const routeRecord = routeRecordsByFilePath.get(routePath.filePath);
    if (routeRecord == null) {
      throw createCacheError(
        `Missing cached route record for "${routePath.filePath}".`,
        {
          filePath: routePath.filePath
        }
      );
    }

    if (routeRecord.plannedHeavyRoute != null) {
      heavyRoutes.push(routeRecord.plannedHeavyRoute);
    }
  }

  return {
    analyzedCount: routePaths.length,
    heavyCount: heavyRoutes.length,
    heavyPaths: heavyRoutes
  };
};

/**
 * Build or reuse the per-target route plan using persistent per-file cache
 * records.
 *
 * @param config - Fully resolved target config.
 * @returns Core pipeline result for the target.
 */
export const buildIncrementalRouteHandlerPipelineResult = async (
  config: ResolvedRouteHandlersConfig
): Promise<RouteHandlerPipelineResult> => {
  // Consumer entry into the target-local incremental planning cache group.
  // This begins by checking whether the non-content environment for the target
  // is still compatible with the previously persisted per-file records.
  const targetIdentity = await computeTargetStaticCacheIdentity({
    config
  });
  const fileCache = createTargetFileCache({
    rootDir: config.app.rootDir,
    targetId: config.targetId
  });
  const snapshotPath = resolveTargetSnapshotPath({
    rootDir: config.app.rootDir,
    targetId: config.targetId
  });
  const existingSnapshot = await readTargetCacheSnapshot(snapshotPath);
  const routePaths = await discoverLocalizedContentRoutes(
    config.paths.contentPagesDir,
    config.localeConfig,
    config.contentLocaleMode
  );
  const currentRouteFilePaths = routePaths.map(routePath => routePath.filePath);
  const existingRouteFilePaths = new Set(
    existingSnapshot?.routeFilePaths ?? []
  );
  const currentRouteFilePathSet = new Set(currentRouteFilePaths);
  const hasMatchingTargetIdentity =
    existingSnapshot?.identity === targetIdentity;
  const removedRouteFilePaths = hasMatchingTargetIdentity
    ? [...existingRouteFilePaths].filter(
        filePath => !currentRouteFilePathSet.has(filePath)
      )
    : [];

  /**
   * Phase 1: target-level invalidation.
   *
   * If the static target identity changed, we cannot trust any existing per-
   * file planning record, even for files whose contents are unchanged. This is
   * the boundary between "incremental reuse is safe" and "rebuild the target's
   * planning state from scratch".
   */
  if (!hasMatchingTargetIdentity) {
    // Static-identity invalidation is the "reset everything" branch of this
    // cache group. If processor identity, MDX options, or other non-content
    // target inputs changed, every per-file record is conservatively dropped.
    clearTargetFileCache(fileCache);
  }

  /**
   * Phase 2: route-set reconciliation.
   *
   * Even on a target-identity hit, the set of route files may have changed.
   * Files that existed in the previous snapshot but no longer exist in the
   * current discovery result must be removed from the per-file cache so they
   * cannot leak back into future warm runs.
   */
  for (const removedRouteFilePath of removedRouteFilePaths) {
    fileCache.removeEntry(removedRouteFilePath);
  }

  const routeRecordsByFilePath = new Map<string, CachedRoutePlanRecord>();
  const routePathsToRecompute: Array<LocalizedRoutePath> = [];

  if (hasMatchingTargetIdentity) {
    /**
     * Phase 3a: incremental reuse under a matching target identity.
     *
     * `file-entry-cache` tells us which currently discovered files changed.
     * For unchanged files we attempt to reuse the persisted planning record in
     * `descriptor.meta.data`. If that metadata is missing or malformed, we
     * degrade gracefully by scheduling the file for recomputation.
     */
    // This branch is the normal incremental cache-hit flow. We let
    // `file-entry-cache` tell us which route files changed and only recompute
    // those files while reusing persisted route-plan records for the rest.
    const analysis = fileCache.analyzeFiles(currentRouteFilePaths);
    const changedRouteFilePaths = new Set([
      ...analysis.changedFiles,
      ...analysis.notFoundFiles
    ]);

    for (const routePath of routePaths) {
      if (changedRouteFilePaths.has(routePath.filePath)) {
        // Content changed, file appeared, or checksum information is missing.
        // This file must go back through capture and planning.
        routePathsToRecompute.push(routePath);
        continue;
      }

      const descriptor = fileCache.getFileDescriptor(routePath.filePath);
      const cachedRoutePlanRecord = getCachedRoutePlanRecord(descriptor);
      if (cachedRoutePlanRecord == null) {
        // The file itself may be unchanged, but without a valid persisted
        // planning record we still cannot safely reuse it.
        routePathsToRecompute.push(routePath);
        continue;
      }

      // Warm-path reuse: the file is unchanged and its persisted planning
      // record is still valid under the current target identity.
      routeRecordsByFilePath.set(routePath.filePath, cachedRoutePlanRecord);
    }
  } else {
    /**
     * Phase 3b: full recompute under a target-identity miss.
     *
     * When target-level static inputs changed, every currently discovered route
     * file must be planned again. We still use the same code path as the
     * incremental branch below; we simply seed it with every route.
     */
    routePathsToRecompute.push(...routePaths);
  }

  if (routePathsToRecompute.length > 0) {
    /**
     * Phase 4: recompute only the necessary files.
     *
     * Planner construction is intentionally lazy. The expensive planner setup
     * only happens if at least one file truly needs recomputation.
     */
    // Planner construction is deferred until the first actual cache miss for
    // this target. That keeps the warm path cheap when every route record is
    // reusable.
    const planRoute = await createRouteHandlerRoutePlanner({
      rootDir: config.paths.rootDir,
      componentsImport: config.componentsImport,
      processorConfig: config.processorConfig,
      runtimeHandlerFactoryImportBase: config.runtimeHandlerFactoryImportBase
    });

    for (const routePath of routePathsToRecompute) {
      const routePlanRecord = await toCachedRoutePlanRecord({
        routePath,
        config,
        planRoute
      });
      const descriptor = fileCache.getFileDescriptor(routePath.filePath);
      // `descriptor.meta.data` is the persistence slot owned by this module.
      // Updating it here means future warm runs can reuse this newly computed
      // planning result without recomputing the file.
      descriptor.meta.data = routePlanRecord;
      routeRecordsByFilePath.set(routePath.filePath, routePlanRecord);
    }
  }

  /**
   * Phase 5: persist and publish.
   *
   * We flush the per-file cache first, then update the target snapshot. That
   * order keeps the snapshot aligned with the record set it is describing:
   * once the snapshot says "this target identity and these route files are
   * current", the corresponding per-file metadata has already been reconciled.
   */
  fileCache.reconcile();

  await writeTargetCacheSnapshot({
    snapshotPath,
    snapshot: {
      version: TARGET_CACHE_SNAPSHOT_VERSION,
      identity: targetIdentity,
      routeFilePaths: currentRouteFilePaths,
      updatedAt: new Date().toISOString()
    }
  });

  // Final step: rebuild the core pipeline result from the mixture of reused and
  // freshly recomputed per-file records accumulated above.
  return buildPipelineResultFromCachedRecords({
    routePaths,
    routeRecordsByFilePath
  });
};
