import { isSingleLocaleConfig } from '../../../core/locale-config';
import type { LocaleConfig } from '../../../core/types';
import { hasLocalePrefix } from '../../shared/public-pathname';
import { hasNonRootRouteBasePath } from '../../shared/route-base-path';
import { buildPhysicalAppDefaultLocaleRoutePath } from '../rewrites/default-locale-normalization';

import type { RouteHandlerProxyDecision } from '../../proxy/runtime/types';
import type {
  RouteHandlerProxyWorkerPassThroughPayload,
  RouteHandlerProxyWorkerTargetOwnedPassThroughPayload
} from '../../proxy/worker/types';

/**
 * Check whether a pass-through worker payload was matched to a configured
 * route-handler target.
 *
 * 1. `light` means the target owns the request, but the route should stay on
 *    the original page instead of rewriting to a generated handler.
 * 2. `missing-route-file` means the target owns the request shape, but the
 *    physical route file is missing and Next should produce the final 404.
 * 3. Both target-owned reasons carry route identity metadata: router kind,
 *    route base path, locale, and slug segments.
 * 4. Generic pass-through reasons do not carry that metadata.
 *
 * @example
 * // Target-owned payloads
 * reason: 'light'              -> true
 * reason: 'missing-route-file' -> true
 *
 * // Generic pass-through payloads
 * reason: 'no-target'                   -> false
 * reason: 'missing-rewrite-destination' -> false
 *
 * @param payload - Worker pass-through payload.
 * @returns `true` when the payload carries target identity metadata.
 */
const isTargetOwnedPassThroughPayload = (
  payload: RouteHandlerProxyWorkerPassThroughPayload
): payload is RouteHandlerProxyWorkerTargetOwnedPassThroughPayload =>
  payload.reason === 'light' || payload.reason === 'missing-route-file';

/**
 * Check whether one proxy pass-through payload can participate in App
 * default-locale normalization.
 *
 * 1. Only target-owned light and missing-route-file results have enough route
 *    identity to build a physical App destination.
 * 2. No-target and missing-rewrite-destination results stay ordinary
 *    pass-through decisions.
 * 3. Pages targets do not use App `[locale]` route normalization.
 *
 * @param payload - Worker pass-through payload.
 * @returns `true` when the payload belongs to an App target-owned route.
 */
const isAppTargetOwnedPassThroughPayload = (
  payload: RouteHandlerProxyWorkerPassThroughPayload
): payload is RouteHandlerProxyWorkerTargetOwnedPassThroughPayload & {
  routerKind: 'app';
} =>
  isTargetOwnedPassThroughPayload(payload) && payload.routerKind === 'app';

/**
 * Build an App-only proxy rewrite for an unprefixed default-locale route.
 *
 * Normalization rules:
 * 1. Only App Router targets participate.
 * 2. Only multi-locale apps need a public default-locale normalization layer.
 * 3. Only non-root target namespaces are safe to normalize.
 * 4. Only default-locale requests are normalized.
 * 5. Already locale-prefixed requests stay on their physical App route.
 *
 * @example
 * // Default locale, unprefixed
 * '/docs/a' -> '/en/docs/a'
 *
 * // Already physical App routes
 * '/en/docs/a' -> no rewrite
 * '/de/docs/a' -> no rewrite
 *
 * // Root target has no safe namespace
 * '/a' -> no rewrite
 *
 * @param input - Proxy normalization input.
 * @param input.pathname - Public request pathname.
 * @param input.routeBasePaths - Known route bases for diagnostic headers.
 * @param input.localeConfig - Locale semantics captured by the proxy bridge.
 * @param input.payload - Worker pass-through payload.
 * @returns App normalization rewrite decision, or `null` when not applicable.
 */
export const buildAppDefaultLocaleNormalizationProxyDecision = ({
  pathname,
  routeBasePaths,
  localeConfig,
  payload
}: {
  pathname: string;
  routeBasePaths: Array<string>;
  localeConfig: LocaleConfig;
  payload: RouteHandlerProxyWorkerPassThroughPayload;
}): Extract<RouteHandlerProxyDecision, { kind: 'rewrite' }> | null => {
  if (!isAppTargetOwnedPassThroughPayload(payload)) {
    return null;
  }

  if (isSingleLocaleConfig(localeConfig)) {
    return null;
  }

  if (!hasNonRootRouteBasePath(payload.routeBasePath)) {
    return null;
  }

  if (payload.locale !== localeConfig.defaultLocale) {
    return null;
  }

  if (hasLocalePrefix(pathname, localeConfig)) {
    return null;
  }

  return {
    kind: 'rewrite',
    pathname,
    routeBasePaths:
      routeBasePaths.length > 0 ? routeBasePaths : [payload.routeBasePath],
    rewriteDestination: buildPhysicalAppDefaultLocaleRoutePath(
      localeConfig,
      payload.routeBasePath,
      payload.slugArray
    )
  };
};
