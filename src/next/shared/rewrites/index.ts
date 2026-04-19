import { toRoutePath } from '../../../core/discovery';
import { isSingleLocaleConfig } from '../../../core/locale-config';
import type { HeavyRouteCandidate, LocaleConfig } from '../../../core/types';
import { dedupeRewriteIdentities } from './identity';
import type { RouteHandlerRewrite, RouteHandlerRewriteBuckets } from '../types';

/**
 * Sort route-handler rewrites by source path for deterministic output.
 *
 * @param rewrites - Rewrite records to sort.
 * @returns The same array instance sorted in place.
 */
const sortRouteHandlerRewrites = (
  rewrites: Array<RouteHandlerRewrite>
): Array<RouteHandlerRewrite> =>
  rewrites.sort((left, right) => left.source.localeCompare(right.source));

/**
 * Builds the route-handler rewrite buckets for a single target configuration.
 *
 * @param heavyRoutes - The routing candidates for the target.
 * @param localeConfig - The locale configuration for the application.
 * @param routeBasePath - The target route base path.
 * @returns An object containing two sorted and deduplicated rewrite buckets:
 * - `rewrites`: Canonical locale-less paths (default locale) and explicit
 *   `/<locale>/...` paths (non-default locales).
 * - `rewritesOfDefaultLocale`: Explicit `/<locale>/...` paths exclusively for
 *   the default locale in multi-locale apps.
 */
export const buildRouteRewriteBuckets = (
  heavyRoutes: Array<HeavyRouteCandidate>,
  localeConfig: LocaleConfig,
  routeBasePath: string,
  handlerRouteSegment = 'generated-handlers'
): RouteHandlerRewriteBuckets => {
  const rewrites: Array<RouteHandlerRewrite> = [];
  const rewritesOfDefaultLocale: Array<RouteHandlerRewrite> = [];
  const isSingleLocale = isSingleLocaleConfig(localeConfig);

  /**
   * Constructs a rewrite record that explicitly bypasses Next.js auto-prefixing.
   *
   * @remarks
   * Consequences of `locale: false`:
   * Disabled Auto-Prefixing:
   * - Prevents Next.js from automatically generating locale-prefixed variants
   *   of the rewrite.
   * Manual Prefixed Paths:
   * - Requires the caller to explicitly construct and emit `/<locale>/...`
   *   paths for all configured locales.
   * Manual Canonical Paths:
   * - Requires the caller to explicitly emit the unprefixed route shape for the
   *   default locale.
   *
   * @param source - Source route path.
   * @param destination - Generated handler destination path.
   * @returns One rewrite record with strict locale handling.
   */
  const createRewrite = (
    source: string,
    destination: string
  ): RouteHandlerRewrite => ({
    source,
    destination,
    locale: false
  });

  for (const entry of heavyRoutes) {
    const sourceRoutePath = toRoutePath(routeBasePath, entry.slugArray);
    const destinationBase = `${routeBasePath}/${handlerRouteSegment}/${entry.handlerRelativePath}`;

    if (entry.locale === localeConfig.defaultLocale) {
      // 1. Add the canonical locale-less public rewrite.
      // Next.js inherently maps the default locale to the unprefixed route shape.
      rewrites.push(createRewrite(sourceRoutePath, destinationBase));

      // 2. Multi-locale apps also expose an explicit /<locale>/... alias for
      //    the default locale. Single-locale apps intentionally skip that
      //    alias so internal locale sentinels never leak into public rewrites.
      if (!isSingleLocale) {
        rewritesOfDefaultLocale.push(
          createRewrite(
            `/${entry.locale}${sourceRoutePath}`,
            `/${entry.locale}${destinationBase}`
          )
        );
      }
      continue;
    }

    // Add the explicit /<locale>/... rewrite for non-default locales.
    rewrites.push(
      createRewrite(
        `/${entry.locale}${sourceRoutePath}`,
        `/${entry.locale}${destinationBase}`
      )
    );
  }

  return {
    // Deduplicate and sort the buckets to ensure a deterministic build output.
    rewrites: sortRouteHandlerRewrites(dedupeRewriteIdentities(rewrites)),
    rewritesOfDefaultLocale: sortRouteHandlerRewrites(
      dedupeRewriteIdentities(rewritesOfDefaultLocale)
    )
  };
};

/**
 * Build Next rewrite entries for the selected heavy routes of one target.
 *
 * @param input - Rewrite construction input.
 * @returns Deterministically ordered rewrite records for the target.
 */
export const buildRouteRewriteEntries = ({
  heavyRoutes,
  localeConfig,
  routeBasePath,
  handlerRouteSegment
}: {
  /**
   * Heavy routes that should be redirected to generated handler pages.
   */
  heavyRoutes: Array<HeavyRouteCandidate>;
  /**
   * Locale configuration of the target.
   */
  localeConfig: LocaleConfig;
  /**
   * Route base path owned by the target.
   */
  routeBasePath: string;
  /**
   * Internal route segment owning generated handler pages.
   */
  handlerRouteSegment?: string;
}): Array<RouteHandlerRewrite> => {
  const rewriteBuckets = buildRouteRewriteBuckets(
    heavyRoutes,
    localeConfig,
    routeBasePath,
    handlerRouteSegment
  );

  return sortRouteHandlerRewrites(
    dedupeRewriteIdentities([
      ...rewriteBuckets.rewrites,
      ...rewriteBuckets.rewritesOfDefaultLocale
    ])
  );
};
