import { toRoutePath } from '../../core/discovery';
import type { HeavyRouteCandidate, LocaleConfig } from '../../core/types';
import { dedupeRewriteIdentities } from './identity';
import type { RewriteRecord, RouteHandlerRewriteBuckets } from '../types';

/**
 * Sort rewrite records by source path for deterministic output.
 *
 * @param rewrites - Rewrite records to sort.
 * @returns The same array instance sorted in place.
 */
const sortRewriteRecords = (
  rewrites: Array<RewriteRecord>
): Array<RewriteRecord> =>
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
 *   the default locale.
 */
export const buildRouteRewriteBuckets = (
  heavyRoutes: Array<HeavyRouteCandidate>,
  localeConfig: LocaleConfig,
  routeBasePath: string
): RouteHandlerRewriteBuckets => {
  const rewrites: Array<RewriteRecord> = [];
  const rewritesOfDefaultLocale: Array<RewriteRecord> = [];

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
  ): RewriteRecord => ({
    source,
    destination,
    locale: false
  });

  for (const entry of heavyRoutes) {
    const sourceRoutePath = toRoutePath(routeBasePath, entry.slugArray);
    const destinationBase = `${routeBasePath}/_handlers/${entry.handlerRelativePath}`;

    if (entry.locale === localeConfig.defaultLocale) {
      // 1. Add the canonical locale-less public rewrite.
      // Next.js inherently maps the default locale to the unprefixed route shape.
      rewrites.push(createRewrite(sourceRoutePath, destinationBase));

      // 2. Add the explicit /<locale>/... rewrite for the default locale.
      rewritesOfDefaultLocale.push(
        createRewrite(
          `/${entry.locale}${sourceRoutePath}`,
          `/${entry.locale}${destinationBase}`
        )
      );
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
    rewrites: sortRewriteRecords(dedupeRewriteIdentities(rewrites)),
    rewritesOfDefaultLocale: sortRewriteRecords(
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
  routeBasePath
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
}): Array<RewriteRecord> => {
  const rewriteBuckets = buildRouteRewriteBuckets(
    heavyRoutes,
    localeConfig,
    routeBasePath
  );

  return sortRewriteRecords(
    dedupeRewriteIdentities([
      ...rewriteBuckets.rewrites,
      ...rewriteBuckets.rewritesOfDefaultLocale
    ])
  );
};
