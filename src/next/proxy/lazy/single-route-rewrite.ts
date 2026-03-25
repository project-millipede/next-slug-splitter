import { buildRouteRewriteEntries } from '../../rewrites';

import type { PlannedHeavyRoute } from '../../../core/types';
import type { ResolvedRouteHandlersConfig } from '../../types';
import type { RouteHandlerLazySingleRouteAnalysisResult } from './types';

/**
 * Resolve the concrete rewrite destination for the current pathname from one
 * concrete heavy-route payload plus its resolved target config.
 *
 * @param input - Rewrite-resolution input.
 * @param input.pathname - Public pathname currently being handled.
 * @param input.config - Fully resolved target config that owns the route.
 * @param input.plannedHeavyRoute - Heavy-route payload to translate into the
 * stable public rewrite shape.
 * @returns Concrete generated-handler destination for the pathname, or `null`
 * when no rewrite matches the pathname.
 *
 * @remarks
 * This helper exists because multiple isolated callers need the same rewrite
 * translation logic:
 * - the immediate lazy request path after one-file analysis
 * - any route-local caller that already has a planned heavy route
 */
export const resolveRouteHandlerHeavyRewriteDestination = ({
  pathname,
  config,
  plannedHeavyRoute
}: {
  pathname: string;
  config: ResolvedRouteHandlersConfig;
  plannedHeavyRoute: PlannedHeavyRoute;
}): string | null => {
  const rewrites = buildRouteRewriteEntries({
    heavyRoutes: [plannedHeavyRoute],
    defaultLocale: config.localeConfig.defaultLocale,
    routeBasePath: config.routeBasePath
  });

  const matchedRewrite = rewrites.find(rewrite => rewrite.source === pathname);
  return matchedRewrite?.destination ?? null;
};

/**
 * Resolve the concrete rewrite destination for the current pathname from one
 * lazily analyzed heavy route.
 *
 * @param input - Rewrite-resolution input.
 * @param input.pathname - Public pathname currently being handled by Proxy.
 * @param input.analysisResult - One-file heavy-route analysis result.
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
export const resolveRouteHandlerLazyRewriteDestination = ({
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
}): string | null =>
  resolveRouteHandlerHeavyRewriteDestination({
    pathname,
    config: analysisResult.config,
    plannedHeavyRoute: analysisResult.plannedHeavyRoute
  });
