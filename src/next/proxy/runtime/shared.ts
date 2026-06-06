import {
  doLocaleConfigsMatch,
  isSingleLocaleConfig
} from '../../../core/locale-config';
import type { LocaleConfig } from '../../../core/types';
import { hasNonRootRouteBasePath } from '../../shared/route-base-path';

export type RouteHandlerProxyMatcherConfig = {
  routeBasePath: string;
  localeConfig: LocaleConfig;
  handlerRouteSegment?: string;
};

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
 * Compare two locale-config objects for exact proxy-bootstrap equality.
 *
 * @param left - Expected locale semantics.
 * @param right - Candidate locale semantics.
 * @returns `true` when both configs have the same default locale and locale order.
 */
export const doesRouteHandlerProxyLocaleConfigMatch = (
  left: LocaleConfig,
  right: LocaleConfig
): boolean => doLocaleConfigsMatch(left, right);

/**
 * Build the generated Proxy matcher for an unprefixed target namespace.
 *
 * 1. The matcher is embedded into the generated root `proxy.ts` file.
 * 2. It claims all public requests below one non-root route base path.
 * 3. Root route base paths return `null` because claiming `/:path*` would make
 *    the generated Proxy observe unrelated application URLs.
 *
 * @example
 * // Non-root target namespace
 * '/a' -> '/a/:path*'
 *
 * // Root target namespace
 * '/'  -> null
 *
 * @param routeBasePath - Target-owned route base path.
 * @returns Static Proxy matcher string, or `null` for the root route base path.
 */
const toRouteMatcher = (routeBasePath: string): string | null => {
  if (!hasNonRootRouteBasePath(routeBasePath)) {
    return null;
  }

  return `${routeBasePath}/:path*`;
};

/**
 * Build the generated Proxy matcher for a locale-prefixed target namespace.
 *
 * 1. The matcher is embedded into the generated root `proxy.ts` file.
 * 2. Multi-locale targets expose explicit `/<locale>/...` public URLs.
 * 3. Proxy matching is static, so each configured locale receives its own
 *    matcher entry.
 * 4. Root route base paths return `null` because claiming `/<locale>/:path*`
 *    would make the generated Proxy observe unrelated application URLs for
 *    that locale prefix.
 *
 * @example
 * // Non-root target namespace
 * locale 'de' + '/a' -> '/de/a/:path*'
 *
 * // Root target namespace
 * locale 'de' + '/'  -> null
 *
 * @param locale - Locale code.
 * @param routeBasePath - Target-owned route base path.
 * @returns Static Proxy matcher string, or `null` for the root route base path.
 */
const toLocalizedRouteMatcher = (
  locale: string,
  routeBasePath: string
): string | null => {
  if (!hasNonRootRouteBasePath(routeBasePath)) {
    return null;
  }

  return `/${locale}${routeBasePath}/:path*`;
};

/**
 * Builds the static proxy matcher list embedded into the generated root
 * `proxy.ts`.
 *
 * @param resolvedConfigs - Route-aware matcher configs.
 * @returns A sorted, deduplicated array of proxy matcher strings.
 *
 * @remarks
 * Matcher Coverage & Behavior:
 * - Included Paths:
 *   Covers the locale-less target route base path and, when multiple locales
 *   are configured, every locale-prefixed variant.
 * - Excluded Paths:
 *   Data requests (`/_next/data/...`) are intentionally NOT matched.
 *   Next.js normalizes these into public pathnames before proxy evaluation,
 *   limiting the proxy's responsibility to public page routes.
 */
export const buildRouteHandlerProxyMatchers = (
  resolvedConfigs: ReadonlyArray<RouteHandlerProxyMatcherConfig>
): Array<string> => {
  // Use a Set to automatically deduplicate overlapping matchers across configs.
  const matchers = new Set<string>();

  for (const config of resolvedConfigs) {
    /*
     * Canonical matcher:
     * 1. A non-root target owns a concrete public namespace.
     * 2. The generated proxy can safely claim that namespace.
     * 3. Root targets are skipped defensively here and rejected by the proxy
     *    file lifecycle before output is written.
     *
     * Example:
     * `/a` -> `/a/:path*`
     */
    const routeMatcher = toRouteMatcher(config.routeBasePath);
    if (routeMatcher == null) {
      continue;
    }

    matchers.add(routeMatcher);

    if (isSingleLocaleConfig(config.localeConfig)) {
      continue;
    }

    for (const locale of config.localeConfig.locales) {
      /*
       * Locale-prefixed matcher:
       * 1. Multi-locale targets also expose explicit `/<locale>/...` paths.
       * 2. Proxy matching happens before runtime code can interpret locale
       *    ownership, so the generated matcher list must enumerate them.
       * 3. The destination decision still happens later inside the proxy
       *    runtime.
       *
       * Example:
       * `/de/a` -> `/de/a/:path*`
       */
      const localizedRouteMatcher = toLocalizedRouteMatcher(
        locale,
        config.routeBasePath
      );

      if (localizedRouteMatcher != null) {
        matchers.add(localizedRouteMatcher);
      }
    }
  }

  // 4. Convert the deduplicated set to a sorted array for deterministic output.
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
export const findMatchedRouteBasePath = (
  pathname: string,
  routeBasePaths: Array<string>
): string | null => {
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
