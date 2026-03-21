/**
 * Next adapter entrypoint for generated rewrite installation.
 *
 * @remarks
 * This file is one of the main consumer-facing call sites in the whole cache
 * architecture. When a Next app uses `withSlugSplitter(...)`, Next eventually
 * reaches this adapter and asks it to modify the effective config.
 *
 * The adapter touches several cache groups in sequence:
 * - first, the preparation-cache group so app-owned prerequisites are ready
 * - then the in-process rewrite cache local to this Node process
 * - then the deeper runtime pipeline which can use shared persistent cache,
 *   target-local incremental planning reuse, and selective emission
 *
 * Documenting the grouping here is useful because this is where many readers
 * start when asking "what cache do consumers actually hit when Next boots?"
 */
import type { NextAdapter } from 'next';
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER
} from 'next/constants.js';

import { createConfigMissingError } from '../utils/errors';
import { resolveRouteHandlersAppConfig } from './config/app';
import type { NextConfigLike } from './config/load-next-config';
import { resolveRouteHandlersConfigs } from './config/resolve-configs';
import { loadRegisteredSlugSplitterConfig } from './integration/slug-splitter-config-loader';
import {
  resolveRegisteredSlugSplitterConfigRegistration
} from './integration/slug-splitter-config';
import { withRouteHandlerRewrites } from './plugin';
import {
  createRouteHandlerProcessCacheIdentity,
  isSameRouteHandlerProcessCacheIdentity,
  type RouteHandlerProcessCacheIdentity
} from './process-cache-identity';
import { prepareRouteHandlersFromConfig } from './prepare';
import { applyRouteHandlerProxyNextConfigPolicy } from './policy/proxy-next-config';
import { synchronizeRouteHandlerProxyFile } from './proxy/file-lifecycle';
import { reconcileRouteHandlerLazyDiscoverySnapshotStartupState } from './proxy/lazy/discovery-snapshot';
import { resolveRouteHandlerRoutingStrategy } from './routing-strategy';
import { executeResolvedRouteHandlerNextPipeline } from './runtime';

import type {
  ResolvedRouteHandlersConfig,
  RewriteRecord,
  RouteHandlersConfig
} from './types';

let cacheIdentity: RouteHandlerProcessCacheIdentity | null = null;
let generationIdentity: RouteHandlerProcessCacheIdentity | null = null;
let cachedRewrites: Array<RewriteRecord> | null = null;
let generationPromise: Promise<Array<RewriteRecord>> | null = null;

/**
 * Determine whether the current Next phase should run route-handler
 * optimization work.
 *
 * @param phase Current Next phase string.
 * @returns `true` when the phase should participate in route-handler rewrite
 * generation.
 */
const isRouteOptimizedPhase = (phase: string): boolean =>
  // Route-handler optimization is only meaningful in phases where Next can
  // either generate assets or serve requests using generated assets. Phases
  // outside this set should not pay any routing or cache coordination cost.
  phase === PHASE_DEVELOPMENT_SERVER ||
  phase === PHASE_PRODUCTION_BUILD ||
  phase === PHASE_PRODUCTION_SERVER;

/**
 * Generate route-handler rewrites for the current app configuration.
 *
 * @param input Rewrite generation input.
 * @param input.rootDir Application root directory.
 * @param input.nextConfigPath Absolute Next config path.
 * @param input.nextConfig Loaded Next config object for the current phase.
 * @returns Generated route-handler rewrites.
 */
const generateRewrites = async ({
  resolvedConfigs
}: {
  resolvedConfigs: Array<ResolvedRouteHandlersConfig>;
}): Promise<Array<RewriteRecord>> => {
  // This is the main hand-off from the adapter layer into the deeper runtime
  // pipeline. Everything below this call is allowed to consult persistent
  // caches, target-local incremental planning state, and selective emission.
  const result = await executeResolvedRouteHandlerNextPipeline({
    resolvedConfigs,
    mode: 'generate'
  });

  return result.rewrites;
};

/**
 * Reuse or compute generated rewrites within the current process.
 *
 * @param input Process-cache input.
 * @param input.phase Current Next phase.
 * @param input.rootDir Application root directory.
 * @param input.nextConfigPath Absolute Next config path.
 * @param input.nextConfig Loaded Next config object for the current phase.
 * @returns Generated rewrite records for the phase and resolved target set.
 *
 * @remarks
 * The in-process cache avoids repeating the same generation work when Next asks
 * for the effective config multiple times during one process lifetime.
 */
const getRewritesWithProcessCache = async ({
  phase,
  rootDir,
  nextConfigPath,
  nextConfig,
  routeHandlersConfig
}: {
  phase: string;
  rootDir: string;
  nextConfigPath: string;
  nextConfig: NextConfigLike;
  routeHandlersConfig: RouteHandlersConfig;
}): Promise<Array<RewriteRecord>> => {
  // Consumer entry into the preparation-cache group from the Next adapter.
  // This makes rewrite generation safe for apps that need build steps such as
  // TypeScript project compilation before route planning begins.
  await prepareRouteHandlersFromConfig({
    rootDir,
    routeHandlersConfig
  });

  const resolvedConfigs = resolveRouteHandlersConfigs({
    rootDir,
    nextConfigPath,
    nextConfig,
    routeHandlersConfig
  });
  const nextIdentity = await createRouteHandlerProcessCacheIdentity({
    phase,
    configs: resolvedConfigs
  });

  if (
    cacheIdentity &&
    isSameRouteHandlerProcessCacheIdentity(cacheIdentity, nextIdentity) &&
    cachedRewrites
  ) {
    // Warm process-local cache hit: the adapter already generated rewrites for
    // the exact same resolved config identity in this Node process.
    return cachedRewrites;
  }

  if (
    generationPromise &&
    generationIdentity &&
    isSameRouteHandlerProcessCacheIdentity(generationIdentity, nextIdentity)
  ) {
    // In-flight dedupe hit: another caller already triggered generation for the
    // same identity, so this caller simply joins that promise.
    return generationPromise;
  }

  generationIdentity = nextIdentity;
  generationPromise = (async () => {
    // Cache the in-flight promise before starting the async work so concurrent
    // callers for the same identity share one generation run.
    //
    // This in-process cache group is intentionally separate from the on-disk
    // shared runtime cache. Its only job is to dedupe repeated adapter calls
    // inside one Node process lifetime.
    const rewrites = await generateRewrites({
      resolvedConfigs
    });
    cacheIdentity = nextIdentity;
    cachedRewrites = rewrites;
    return rewrites;
  })().finally(() => {
    generationPromise = null;
    generationIdentity = null;
  });

  return generationPromise;
};

const routeHandlersAdapter: NextAdapter = {
  name: 'route-handlers-adapter',
  async modifyConfig(config, { phase }) {
    if (!isRouteOptimizedPhase(phase)) {
      return config;
    }

    const routeHandlersConfig = await loadRegisteredSlugSplitterConfig();
    if (routeHandlersConfig == null) {
      throw createConfigMissingError(
        'Missing registered routeHandlersConfig. Call withSlugSplitter(...) or createRouteHandlersAdapterPath(...) before exporting the Next config.'
      );
    }

    const appConfig = resolveRouteHandlersAppConfig({
      routeHandlersConfig
    });
    const resolvedConfigs = resolveRouteHandlersConfigs({
      rootDir: appConfig.rootDir,
      nextConfigPath: appConfig.nextConfigPath,
      nextConfig: config,
      routeHandlersConfig
    });
    const routingStrategy = resolveRouteHandlerRoutingStrategy({
      phase,
      routingPolicy: appConfig.routing
    });

    // This is the first routing-strategy split in the adapter. Before the
    // plugin decides whether it will install rewrites or rely on a generated
    // root Proxy file, it synchronizes the filesystem artifact that must match
    // the selected strategy.
    await synchronizeRouteHandlerProxyFile({
      rootDir: appConfig.rootDir,
      strategy: routingStrategy,
      resolvedConfigs,
      configRegistration: resolveRegisteredSlugSplitterConfigRegistration({
        rootDir: appConfig.rootDir
      })
    });

    if (routingStrategy.kind === 'proxy') {
      // Proxy mode now has one additional startup-maintenance group:
      // persisted lazy discovery snapshots. This hook reconciles persisted
      // request-time discoveries against the current resolved target set so
      // orphaned one-file lazy outputs can be removed before the next request
      // reaches the proxy runtime.
      await reconcileRouteHandlerLazyDiscoverySnapshotStartupState({
        resolvedConfigs
      });

      // Proxy mode is intentionally a distinct routing path. The adapter does
      // not generate or install route-handler rewrites up front in this branch.
      //
      // Instead, the generated root `proxy.ts` delegates requests back into the
      // library-owned proxy runtime, which consults cached heavy-route
      // knowledge on demand without any whole-target generate fallback.
      return applyRouteHandlerProxyNextConfigPolicy({
        config,
        routingStrategy
      });
    }

    // This call is the consumer-facing entrance into the adapter-side cache
    // stack. From here the request can travel through preparation caching,
    // process-local rewrite caching, runtime shared-cache policy, target-local
    // planning reuse, and selective emission before rewrites come back.
    const rewrites = await getRewritesWithProcessCache({
      phase,
      rootDir: appConfig.rootDir,
      nextConfigPath: appConfig.nextConfigPath,
      nextConfig: config,
      routeHandlersConfig
    });

    // The returned value is the effective config for the current phase.
    // A wrapped copy is returned so the incoming config object stays unchanged.
    return withRouteHandlerRewrites(config, rewrites);
  }
};

export default routeHandlersAdapter;
