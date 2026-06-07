import { buildRouteRewriteEntries } from '../../shared/rewrites/index';
import path from 'node:path';

import { hasGeneratedHandlersInAppLocaleSubtree } from '../../app/generated-handlers/location';

import type { PlannedHeavyRoute } from '../../../core/types';
import type {
  RouteHandlerLazyHeavyAnalysisResult,
  RouteHandlerLazyPlannerConfig
} from './types';

/**
 * Check whether one lazy proxy target emits generated handlers below its
 * physical App locale route segment.
 *
 * 1. Pages Router and conventional App output use locale-less destinations.
 * 2. Locale-scoped App output uses locale-prefixed destinations so the rewrite
 *    stays inside the physical locale layout subtree.
 *
 * @param config - Lazy planner config that owns the route.
 * @returns `true` when generated-handler destinations need a route-locale
 * prefix.
 */
const hasLocaleScopedLazyGeneratedHandlerDestinations = (
  config: RouteHandlerLazyPlannerConfig
): boolean =>
  Boolean(
    config.routerKind === 'app' &&
      hasGeneratedHandlersInAppLocaleSubtree(
        config.paths,
        config.localeRouteParamName
      )
  );

/**
 * Resolve the concrete rewrite destination for the current pathname from one
 * concrete heavy-route payload plus its resolved target config.
 *
 * @param pathname - Public pathname currently being handled.
 * @param config - Fully resolved target config that owns the route.
 * @param plannedHeavyRoute - Heavy-route payload to translate into the stable
 * public rewrite shape.
 * @returns Concrete generated-handler destination for the pathname, or `null`
 * when no rewrite matches the pathname.
 *
 * @remarks
 * This helper exists because multiple isolated callers need the same rewrite
 * translation logic:
 * - the immediate lazy request path after one-file analysis
 * - any route-local caller that already has a planned heavy route
 */
const resolveRouteHandlerHeavyRewriteDestination = (
  pathname: string,
  config: RouteHandlerLazyPlannerConfig,
  plannedHeavyRoute: PlannedHeavyRoute
): string | null => {
  const rewrites = buildRouteRewriteEntries({
    heavyRoutes: [plannedHeavyRoute],
    localeConfig: config.localeConfig,
    routeBasePath: config.routeBasePath,
    handlerRouteSegment:
      config.handlerRouteSegment ?? path.basename(config.paths.generatedDir),
    generatedHandlersAreLocaleScoped:
      hasLocaleScopedLazyGeneratedHandlerDestinations(config)
  });

  const matchedRewrite = rewrites.find(rewrite => rewrite.source === pathname);
  return matchedRewrite?.destination ?? null;
};

/**
 * Resolve the concrete rewrite destination for the current pathname from one
 * lazily analyzed heavy route.
 *
 * @param pathname - Public pathname currently being handled by Proxy.
 * @param analysisResult - One-file heavy-route analysis result.
 * @returns Concrete generated-handler destination for the pathname, or `null`
 * when no rewrite matches the pathname.
 *
 * @remarks
 * This module deliberately owns only rewrite-shape resolution. It does not:
 * - emit files
 * - decide whether a route is heavy
 * - create proxy responses
 *
 * That keeps the "how do we compute the final destination path?" logic aligned
 * with the stable rewrite builder while remaining independently testable.
 */
export const resolveRouteHandlerLazyRewriteDestination = (
  pathname: string,
  analysisResult: RouteHandlerLazyHeavyAnalysisResult
): string | null =>
  resolveRouteHandlerHeavyRewriteDestination(
    pathname,
    analysisResult.config,
    analysisResult.plannedHeavyRoute
  );
