import { computeTargetStaticCacheIdentity } from '../../cache';
import { resolveRenderedHandlerPageLocation } from '../../../generator/rendered-page';
import { removeRouteHandlerLazyOutputAtKnownLocation } from './stale-output-cleanup';
import {
  readPersistedRouteHandlerLazyDiscoverySnapshotEntries,
  writePersistedRouteHandlerLazyDiscoverySnapshotEntries,
  type RouteHandlerLazyDiscoverySnapshotEntry
} from './discovery-snapshot-store';
import { resolveRouteHandlerHeavyRewriteDestination } from './single-route-rewrite';
import { readLazySingleRouteCachedPlanRecord } from './single-route-cache';

import type { RouteHandlerProxyRoutingState } from '../types';
import type { RouteHandlerLazySingleRouteAnalysisResult } from './types';
import type { ResolvedRouteHandlersConfig } from '../../types';

/**
 * Process-local snapshots of lazily discovered heavy-route rewrites, keyed by
 * application root and then by exact public pathname.
 *
 * @remarks
 * The extra root-directory partition keeps the in-memory snapshot protocol
 * honest if multiple apps are ever loaded into one Node process. Inside each
 * root-local snapshot, the key remains the exact public pathname because that
 * is the lookup identity used by proxy request routing.
 *
 * The value deliberately does not cache the final rewrite destination blindly.
 * We instead recompute that destination from the current validated one-file
 * route-plan record so the snapshot stays tied to the same routing rules as the
 * stable rewrite builder.
 */
const routeHandlerLazyDiscoverySnapshotsByRootDir = new Map<
  string,
  Map<string, RouteHandlerLazyDiscoverySnapshotEntry>
>();
const hydratedRouteHandlerLazyDiscoverySnapshotRoots = new Set<string>();

/**
 * Read the application root directory from current proxy routing state.
 *
 * @param routingState - Current proxy routing state.
 * @returns Application root directory when any resolved target is present,
 * otherwise `null`.
 */
const readRouteHandlerLazyDiscoverySnapshotRootDirFromRoutingState = ({
  pathname,
  routingState
}: {
  pathname: string;
  routingState: RouteHandlerProxyRoutingState;
}): string | null => {
  const firstResolvedConfig =
    routingState.resolvedConfigsByTargetId.values().next().value;

  if (firstResolvedConfig?.app.rootDir != null) {
    return firstResolvedConfig.app.rootDir;
  }

  // If current routing state has no resolved targets, we still try to recover
  // a root from already-hydrated in-memory snapshots. That lets a same-process
  // "target disappeared" scenario clean up its previously published lazy
  // output instead of silently leaking the stale file.
  for (const [
    rootDir,
    snapshotForRoot
  ] of routeHandlerLazyDiscoverySnapshotsByRootDir.entries()) {
    if (snapshotForRoot.has(pathname)) {
      return rootDir;
    }
  }

  return null;
};

/**
 * Get the current in-memory snapshot map for one app root, creating it if
 * needed.
 *
 * @param rootDir - Application root directory.
 * @returns Mutable root-local snapshot map.
 */
const getOrCreateRouteHandlerLazyDiscoverySnapshotForRoot = (
  rootDir: string
): Map<string, RouteHandlerLazyDiscoverySnapshotEntry> => {
  let snapshotForRoot = routeHandlerLazyDiscoverySnapshotsByRootDir.get(rootDir);

  if (snapshotForRoot == null) {
    snapshotForRoot = new Map();
    routeHandlerLazyDiscoverySnapshotsByRootDir.set(rootDir, snapshotForRoot);
  }

  return snapshotForRoot;
};

/**
 * Persist the current in-memory snapshot map for one app root.
 *
 * @param rootDir - Application root directory.
 */
const persistRouteHandlerLazyDiscoverySnapshotForRoot = async (
  rootDir: string
): Promise<void> => {
  await writePersistedRouteHandlerLazyDiscoverySnapshotEntries({
    rootDir,
    entries: getOrCreateRouteHandlerLazyDiscoverySnapshotForRoot(rootDir)
  });
};

/**
 * Ensure the root-local in-memory snapshot has been hydrated from persisted
 * storage.
 *
 * @param rootDir - Application root directory.
 * @returns Hydrated root-local snapshot map.
 *
 * @remarks
 * Hydration is intentionally lazy. The proxy path should not pay JSON cache
 * read costs until it actually reaches the snapshot layer for the current app.
 */
const ensureHydratedRouteHandlerLazyDiscoverySnapshotForRoot = async (
  rootDir: string
): Promise<Map<string, RouteHandlerLazyDiscoverySnapshotEntry>> => {
  if (!hydratedRouteHandlerLazyDiscoverySnapshotRoots.has(rootDir)) {
    routeHandlerLazyDiscoverySnapshotsByRootDir.set(
      rootDir,
      await readPersistedRouteHandlerLazyDiscoverySnapshotEntries({
        rootDir
      })
    );
    hydratedRouteHandlerLazyDiscoverySnapshotRoots.add(rootDir);
  }

  return getOrCreateRouteHandlerLazyDiscoverySnapshotForRoot(rootDir);
};

/**
 * Replace the root-local in-memory snapshot map with the provided entry set and
 * mark it as hydrated.
 *
 * @param input - Synchronization input.
 * @param input.rootDir - Application root directory.
 * @param input.entries - Root-local snapshot entries keyed by pathname.
 */
const synchronizeHydratedRouteHandlerLazyDiscoverySnapshotForRoot = ({
  rootDir,
  entries
}: {
  rootDir: string;
  entries: Map<string, RouteHandlerLazyDiscoverySnapshotEntry>;
}): void => {
  routeHandlerLazyDiscoverySnapshotsByRootDir.set(rootDir, entries);
  hydratedRouteHandlerLazyDiscoverySnapshotRoots.add(rootDir);
};

/**
 * Reconcile persisted lazy discovery entries against the currently resolved
 * target set during proxy startup.
 *
 * @param input - Reconciliation input.
 * @param input.resolvedConfigs - Current fully resolved target configs.
 *
 * @remarks
 * This startup maintenance hook handles the restart-time orphan case:
 * - a previous dev session lazily emitted one-file handler outputs
 * - the server restarted before another request could invalidate them
 * - a target later disappeared or moved
 *
 * In that scenario we remove the orphaned output and drop the persisted lazy
 * discovery entry before requests begin flowing through proxy routing again.
 */
export const reconcileRouteHandlerLazyDiscoverySnapshotStartupState = async ({
  resolvedConfigs
}: {
  resolvedConfigs: Array<ResolvedRouteHandlersConfig>;
}): Promise<void> => {
  const [referenceResolvedConfig] = resolvedConfigs;

  if (referenceResolvedConfig == null) {
    return;
  }

  const rootDir = referenceResolvedConfig.app.rootDir;
  const persistedEntries =
    await ensureHydratedRouteHandlerLazyDiscoverySnapshotForRoot(rootDir);
  const resolvedConfigsByTargetId = new Map(
    resolvedConfigs.map(resolvedConfig => [resolvedConfig.targetId, resolvedConfig])
  );
  let didMutateSnapshot = false;

  for (const [pathname, snapshotEntry] of persistedEntries.entries()) {
    const owningConfig = resolvedConfigsByTargetId.get(snapshotEntry.targetId);

    if (
      owningConfig == null ||
      owningConfig.paths.handlersDir !== snapshotEntry.handlersDir
    ) {
      await removeRouteHandlerLazyOutputAtKnownLocation({
        handlersDir: snapshotEntry.handlersDir,
        pageFilePath: snapshotEntry.pageFilePath
      });
      persistedEntries.delete(pathname);
      didMutateSnapshot = true;
    }
  }

  if (didMutateSnapshot) {
    synchronizeHydratedRouteHandlerLazyDiscoverySnapshotForRoot({
      rootDir,
      entries: persistedEntries
    });
    await persistRouteHandlerLazyDiscoverySnapshotForRoot(rootDir);
  }
};

/**
 * Publish one freshly discovered lazy heavy route into the process-local
 * snapshot.
 *
 * @param input - Publish input.
 * @param input.pathname - Public pathname that triggered lazy discovery.
 * @param input.analysisResult - Fresh or cached heavy one-file analysis result.
 *
 * @remarks
 * This helper intentionally stores only structural identity:
 * - which public pathname was discovered
 * - which target owns it
 * - which exact localized content file backs it
 *
 * All expensive correctness checks remain deferred to the snapshot read path,
 * where they can validate the discovery against the latest target identity and
 * the latest one-file lazy cache record.
 */
export const publishRouteHandlerLazyDiscoverySnapshotEntry = async ({
  pathname,
  analysisResult
}: {
  pathname: string;
  analysisResult: Extract<
    RouteHandlerLazySingleRouteAnalysisResult,
    {
      kind: 'heavy';
    }
  >;
}): Promise<void> => {
  const { pageFilePath } = resolveRenderedHandlerPageLocation({
    paths: analysisResult.config.paths,
    emitFormat: analysisResult.config.emitFormat,
    handlerRelativePath: analysisResult.plannedHeavyRoute.handlerRelativePath
  });
  const rootDir = analysisResult.config.app.rootDir;
  const snapshotForRoot =
    await ensureHydratedRouteHandlerLazyDiscoverySnapshotForRoot(rootDir);

  snapshotForRoot.set(pathname, {
    version: 1,
    pathname,
    targetId: analysisResult.config.targetId,
    routePath: analysisResult.routePath,
    handlersDir: analysisResult.config.paths.handlersDir,
    pageFilePath
  });
  await persistRouteHandlerLazyDiscoverySnapshotForRoot(rootDir);
};

/**
 * Remove one snapshot entry, or clear the full snapshot when no pathname is
 * provided.
 *
 * @param input - Invalidation input.
 * @param input.pathname - Optional exact public pathname to remove.
 *
 * @remarks
 * This is primarily useful for test isolation today, but keeping the
 * invalidation primitive explicit now makes future cache-lifecycle work
 * easier. Request-routing and lazy analysis should not mutate the underlying
 * snapshot map directly.
 */
export const invalidateRouteHandlerLazyDiscoverySnapshot = async ({
  rootDir,
  pathname
}: {
  rootDir?: string;
  pathname?: string;
} = {}): Promise<void> => {
  if (rootDir == null && pathname == null) {
    const knownRootDirs = [
      ...routeHandlerLazyDiscoverySnapshotsByRootDir.keys(),
      ...hydratedRouteHandlerLazyDiscoverySnapshotRoots
    ];

    routeHandlerLazyDiscoverySnapshotsByRootDir.clear();
    hydratedRouteHandlerLazyDiscoverySnapshotRoots.clear();
    await Promise.all(
      [...new Set(knownRootDirs)].map(knownRootDir =>
        writePersistedRouteHandlerLazyDiscoverySnapshotEntries({
          rootDir: knownRootDir,
          entries: new Map()
        })
      )
    );
    return;
  }

  const rootDirsToInvalidate =
    rootDir == null
      ? [...routeHandlerLazyDiscoverySnapshotsByRootDir.keys()]
      : [rootDir];

  await Promise.all(
    rootDirsToInvalidate.map(async candidateRootDir => {
      const snapshotForRoot =
        await ensureHydratedRouteHandlerLazyDiscoverySnapshotForRoot(
          candidateRootDir
        );

      if (pathname == null) {
        snapshotForRoot.clear();
      } else {
        snapshotForRoot.delete(pathname);
      }

      await persistRouteHandlerLazyDiscoverySnapshotForRoot(candidateRootDir);
    })
  );
};

/**
 * Try to reuse one previously published lazy heavy-route discovery for the
 * current pathname.
 *
 * @param input - Snapshot-read input.
 * @param input.pathname - Public pathname being handled by proxy.
 * @param input.routingState - Fresh proxy routing state for the current
 * request environment.
 * @returns Concrete generated-handler rewrite destination when the published
 * discovery is still valid, otherwise `null`.
 *
 * @remarks
 * This is the critical correctness boundary for the new snapshot layer.
 * Merely remembering that a pathname was heavy once is not enough, because the
 * backing content file or target config may have changed while the dev server
 * stayed up.
 *
 * So the read path always revalidates the snapshot entry against:
 * - the latest resolved target config from the current routing-state load
 * - the latest target static identity for that config
 * - the latest lazy single-route cache record for the backing content file
 *
 * Only when all of those checks still agree do we skip the slower lazy miss
 * workflow and return a rewrite directly.
 */
export const readRouteHandlerLazyDiscoverySnapshotRewrite = async ({
  pathname,
  routingState
}: {
  pathname: string;
  routingState: RouteHandlerProxyRoutingState;
}): Promise<string | null> => {
  const rootDir = readRouteHandlerLazyDiscoverySnapshotRootDirFromRoutingState(
    {
      pathname,
      routingState
    }
  );

  if (rootDir == null) {
    return null;
  }

  const snapshotEntry = (
    await ensureHydratedRouteHandlerLazyDiscoverySnapshotForRoot(rootDir)
  ).get(pathname);

  if (snapshotEntry == null) {
    return null;
  }

  const config = routingState.resolvedConfigsByTargetId.get(
    snapshotEntry.targetId
  );

  if (config == null) {
    // If the owning target disappeared or can no longer be resolved, the
    // published discovery is no longer meaningful and must be dropped.
    await removeRouteHandlerLazyOutputAtKnownLocation({
      handlersDir: snapshotEntry.handlersDir,
      pageFilePath: snapshotEntry.pageFilePath
    });
    await invalidateRouteHandlerLazyDiscoverySnapshot({
      rootDir,
      pathname
    });
    return null;
  }

  const targetIdentity = await computeTargetStaticCacheIdentity({
    config
  });
  const cachedRoutePlanRecord = readLazySingleRouteCachedPlanRecord({
    config,
    targetIdentity,
    routePath: snapshotEntry.routePath
  });

  if (cachedRoutePlanRecord?.plannedHeavyRoute == null) {
    // Either the backing file changed, disappeared, or is now light for the
    // current target identity. In all of those cases the snapshot entry must
    // stop short-circuiting requests and yield back to the normal lazy miss
    // path. Because the underlying route is no longer heavy, the previously
    // emitted one-file lazy output should also be removed.
    await removeRouteHandlerLazyOutputAtKnownLocation({
      handlersDir: snapshotEntry.handlersDir,
      pageFilePath: snapshotEntry.pageFilePath
    });
    await invalidateRouteHandlerLazyDiscoverySnapshot({
      rootDir,
      pathname
    });
    return null;
  }

  const rewriteDestination = resolveRouteHandlerHeavyRewriteDestination({
    pathname,
    config,
    plannedHeavyRoute: cachedRoutePlanRecord.plannedHeavyRoute
  });

  if (rewriteDestination == null) {
    // Rewrite generation is still the final authority on whether the public
    // pathname maps back to a handler destination. If the current rewrite rules
    // no longer produce a match, the snapshot entry is stale and should be
    // discarded rather than partially trusted.
    await invalidateRouteHandlerLazyDiscoverySnapshot({
      rootDir,
      pathname
    });
    return null;
  }

  return rewriteDestination;
};
