import type { NextRequest } from 'next/server.js';

import { isPrimaryHtmlNavigationRequest } from './navigation';

import type { RouteHandlerProxyRequestShape } from '../proxy/runtime/request-shape';
import type { RouteHandlerProxyDecision } from '../proxy/runtime/types';

/**
 * Convert one rewrite decision into the temporary self-redirect decision used
 * by the current dev-only stabilization policy.
 *
 * @param decision - Resolved rewrite decision.
 * @returns Equivalent redirect decision that keeps the browser on the same
 * public pathname for one extra request boundary.
 */
const createRefreshBeforeRewriteDecision = (
  decision: Extract<RouteHandlerProxyDecision, { kind: 'rewrite' }>
): Extract<RouteHandlerProxyDecision, { kind: 'redirect' }> => ({
  kind: 'redirect',
  pathname: decision.pathname,
  routeBasePaths: decision.routeBasePaths,
  redirectDestination: decision.pathname
});

/**
 * Check whether the current request should pay one temporary refresh boundary
 * before entering an already-updated generated handler route.
 *
 * @param request - Incoming Next proxy request.
 * @param requestShape - Normalized proxy request shape.
 * @param updatedHandlerWasRewritten - Whether lazy heavy preparation
 * overwrote an existing generated handler file during this request.
 * @returns `true` when the response should temporarily redirect instead of
 * entering the updated generated handler immediately.
 */
const shouldRefreshUpdatedHandlerRewrite = (
  request: NextRequest,
  requestShape: RouteHandlerProxyRequestShape,
  updatedHandlerWasRewritten: boolean
): boolean => {
  if (!updatedHandlerWasRewritten) {
    return false;
  }

  return isPrimaryHtmlNavigationRequest(request, requestShape);
};

/**
 * Resolve the final response-side decision for one request after applying the
 * updated-handler redirect safeguard.
 *
 * Policy flow:
 * 1. Only rewrite decisions participate.
 * 2. Only rewrites for updated generated handlers on the primary HTML
 *    navigation request pay the refresh boundary. Data transport and
 *    probe-style requests stay on the fast rewrite path.
 * 3. When both conditions hold, the rewrite is converted into one temporary
 *    self-redirect to the same public pathname.
 *
 * Why:
 * The proxy can already know the correct generated handler destination while
 * Next/Turbopack is still catching up to the generated module state for that
 * route.
 * The extra request boundary reduces the chance that the browser enters the
 * rewritten handler too early.
 *
 * @param request - Incoming Next proxy request.
 * @param requestShape - Normalized proxy request shape.
 * @param decision - Pure route decision for the current request.
 * @param updatedHandlerWasRewritten - Whether lazy heavy preparation
 * overwrote an existing generated handler file during this request.
 * @returns Final response decision after applying the updated-handler
 * redirect safeguard.
 */
export const resolveRouteHandlerProxyRewriteResponseDecision = (
  request: NextRequest,
  requestShape: RouteHandlerProxyRequestShape,
  decision: RouteHandlerProxyDecision,
  updatedHandlerWasRewritten: boolean
): RouteHandlerProxyDecision => {
  // 1. Only rewrite decisions participate.
  if (decision.kind !== 'rewrite') {
    return decision;
  }

  // 2. Only updated-handler rewrites on primary HTML navigation participate.
  const shouldRefreshRewrite = shouldRefreshUpdatedHandlerRewrite(
    request,
    requestShape,
    updatedHandlerWasRewritten
  );

  if (!shouldRefreshRewrite) {
    return decision;
  }

  // 3. Convert the rewrite into one temporary self-redirect.
  return createRefreshBeforeRewriteDecision(decision);
};
