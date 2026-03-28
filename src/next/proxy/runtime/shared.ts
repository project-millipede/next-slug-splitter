import type {
  ResolvedRouteHandlersConfig
} from '../../types';
import { normalizeRouteBasePath } from '../../config/options';

/**
 * Ownership marker embedded into plugin-generated root proxy files.
 *
 * @remarks
 * Cleanup logic relies on this marker to distinguish plugin-owned generated
 * files from user-authored `proxy.ts` files that must never be deleted.
 */
export const ROUTE_HANDLER_PROXY_OWNERSHIP_MARKER =
  'next-slug-splitter:experimental-synthetic-proxy';

/**
 * Diagnostic header attached to proxy responses.
 */
export const ROUTE_HANDLER_PROXY_HEADER =
  'x-next-slug-splitter-synthetic-proxy';

/**
 * Diagnostic header that reports which configured route base path matched the
 * current request.
 */
export const ROUTE_HANDLER_PROXY_TARGET_HEADER =
  'x-next-slug-splitter-synthetic-proxy-target';

/**
 * Convert one route base path into the non-locale matcher used by Proxy.
 *
 * @param routeBasePath - Target-owned route base path.
 * @returns Static matcher string.
 */
const toRouteMatcher = (routeBasePath: string): string =>
  // The root route is special because `/:path*` is the static matcher shape
  // that tells Next "proxy every path under the root segment." Non-root base
  // paths can stay namespaced under their configured public prefix.
  routeBasePath === '/' ? '/:path*' : `${routeBasePath}/:path*`;

/**
 * Convert one route base path into a locale-prefixed matcher.
 *
 * @param locale - Locale code.
 * @param routeBasePath - Target-owned route base path.
 * @returns Static matcher string for the locale-prefixed public route.
 */
const toLocalizedRouteMatcher = (
  locale: string,
  routeBasePath: string
): string =>
  // Locale-prefixed public URLs are still served by the same configured target,
  // but Next's matcher language requires us to enumerate those prefixes
  // statically in the generated root `proxy.ts`.
  routeBasePath === '/'
    ? `/${locale}/:path*`
    : `/${locale}${routeBasePath}/:path*`;

/**
 * Build the static matcher list embedded into the generated root `proxy.ts`.
 *
 * @param resolvedConfigs - Fully resolved target configs.
 * @returns Sorted, deduplicated proxy matcher strings.
 *
 * @remarks
 * The matchers cover:
 * - the locale-less target route base path
 * - every locale-prefixed variant of that route base path
 *
 * Data requests (`/_next/data/...`) are intentionally NOT matched. Next
 * normalizes those into public pathnames before the proxy sees them, so the
 * proxy only needs to match public page routes.
 */
export const buildRouteHandlerProxyMatchers = (
  resolvedConfigs: Array<ResolvedRouteHandlersConfig>
): Array<string> => {
  const matchers = new Set<string>();

  for (const config of resolvedConfigs) {
    // Every target should match its locale-less public route so default-locale
    // navigation and applications without explicit locale prefixes are covered.
    matchers.add(toRouteMatcher(config.routeBasePath));

    for (const locale of config.localeConfig.locales) {
      // Locale-prefixed requests need their own static matcher because Proxy
      // matcher evaluation happens before our runtime code can inspect the
      // pathname and decide whether it belongs to a localized heavy route.
      matchers.add(toLocalizedRouteMatcher(locale, config.routeBasePath));
    }
  }

  return [...matchers].sort((left, right) => left.localeCompare(right));
};

/**
 * Determine which configured route base path owns a pathname, if any.
 *
 * @param pathname - Public request pathname.
 * @param routeBasePaths - Known route base paths.
 * @returns The matching route base path or `null`.
 *
 * @remarks
 * The route base paths are sorted before matching so longer, more specific
 * prefixes win over shorter ones. That avoids ambiguous ownership when one
 * route base path is nested inside another.
 */
export const findMatchedRouteBasePath = ({
  pathname,
  routeBasePaths
}: {
  pathname: string;
  routeBasePaths: Array<string>;
}): string | null => {
  // We sort by descending length so `/docs/api` beats `/docs` when both are
  // configured. That gives the diagnostic header the same "most specific owner
  // wins" behavior developers usually expect from routing systems.
  const sortedRouteBasePaths = [...routeBasePaths].sort(
    (left, right) => right.length - left.length
  );
  // The proxy runtime uses this helper only for diagnostics, not for the
  // actual heavy-route rewrite decision. Stripping the first segment lets the
  // same helper still identify `/de/docs/...` as `/docs` without having to
  // thread locale metadata through every caller.
  const pathnameWithoutLeadingSegment = pathname.replace(/^\/[^/]+/, '');

  for (const routeBasePath of sortedRouteBasePaths) {
    if (routeBasePath === '/') {
      // Root is the catch-all owner of last resort. It is intentionally checked
      // last in practice because the list is sorted by length, but once reached
      // it should always win.
      return routeBasePath;
    }

    if (
      pathname === routeBasePath ||
      pathname.startsWith(`${routeBasePath}/`) ||
      pathnameWithoutLeadingSegment === routeBasePath ||
      pathnameWithoutLeadingSegment.startsWith(`${routeBasePath}/`)
    ) {
      // The final two checks intentionally treat the first path segment as an
      // optional locale-like prefix. This keeps the diagnostic target header
      // useful for paths such as `/de/docs/example` without requiring the
      // caller to pass locale metadata into this purely observational helper.
      return routeBasePath;
    }
  }

  // Returning `null` keeps the caller free to omit the diagnostic target
  // header entirely instead of inventing a misleading "closest" match.
  return null;
};
