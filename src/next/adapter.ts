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
import { withRouteHandlerRewrites } from './plugin';
import {
  createRouteHandlerProcessCacheIdentity,
  isSameRouteHandlerProcessCacheIdentity,
  type RouteHandlerProcessCacheIdentity
} from './process-cache-identity';
import { executeRouteHandlerNextPipeline } from './runtime';

import type { RewriteRecord, RouteHandlersConfig } from './types';

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
  rootDir,
  nextConfigPath,
  nextConfig,
  routeHandlersConfig
}: {
  rootDir: string;
  nextConfigPath: string;
  nextConfig: NextConfigLike;
  routeHandlersConfig: RouteHandlersConfig;
}): Promise<Array<RewriteRecord>> => {
  const result = await executeRouteHandlerNextPipeline({
    rootDir,
    nextConfigPath,
    nextConfig,
    routeHandlersConfig,
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
  const resolvedConfigs = resolveRouteHandlersConfigs({
    rootDir,
    nextConfigPath,
    nextConfig,
    routeHandlersConfig
  });
  const nextIdentity = createRouteHandlerProcessCacheIdentity({
    phase,
    configs: resolvedConfigs
  });

  if (
    cacheIdentity &&
    isSameRouteHandlerProcessCacheIdentity(cacheIdentity, nextIdentity) &&
    cachedRewrites
  ) {
    return cachedRewrites;
  }

  if (
    generationPromise &&
    generationIdentity &&
    isSameRouteHandlerProcessCacheIdentity(generationIdentity, nextIdentity)
  ) {
    return generationPromise;
  }

  generationIdentity = nextIdentity;
  generationPromise = (async () => {
    // Cache the in-flight promise before starting the async work so concurrent
    // callers for the same identity share one generation run.
    const rewrites = await generateRewrites({
      rootDir,
      nextConfigPath,
      nextConfig,
      routeHandlersConfig
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
