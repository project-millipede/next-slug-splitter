import { toRoutePath } from '../core/discovery';
import type { HeavyRouteCandidate } from '../core/types';
import { dedupeRewriteIdentities } from './rewrite-identity';
import type { RewriteRecord } from './types';

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
 * Build Next rewrite entries for the selected heavy routes of one target.
 *
 * @param input - Rewrite construction input.
 * @returns Deterministically ordered rewrite records for the target.
 */
export const buildRouteRewriteEntries = ({
  heavyRoutes,
  defaultLocale,
  routeBasePath
}: {
  /**
   * Heavy routes that should be redirected to generated handler pages.
   */
  heavyRoutes: Array<HeavyRouteCandidate>;
  /**
   * Default locale of the target.
   */
  defaultLocale: string;
  /**
   * Route base path owned by the target.
   */
  routeBasePath: string;
}): Array<RewriteRecord> => {
  const rewrites: Array<RewriteRecord> = [];

  /**
   * Push one route-handler rewrite.
   *
   * @param source - Source route path.
   * @param destination - Generated handler destination path.
   */
  const addRewrite = (source: string, destination: string): void => {
    rewrites.push({
      source,
      destination,
      locale: false
    });
  };

  for (const entry of heavyRoutes) {
    const sourceRoutePath = toRoutePath(routeBasePath, entry.slugArray);
    const destinationBase = `${routeBasePath}/_handlers/${entry.handlerRelativePath}`;

    if (entry.locale === defaultLocale) {
      // Default-locale targets need both the locale-less public route and the
      // locale-prefixed variant to land on the same generated handler.
      addRewrite(sourceRoutePath, destinationBase);
      addRewrite(
        `/${entry.locale}${sourceRoutePath}`,
        `/${entry.locale}${destinationBase}`
      );
      continue;
    }

    addRewrite(
      `/${entry.locale}${sourceRoutePath}`,
      `/${entry.locale}${destinationBase}`
    );
  }

  return sortRewriteRecords(dedupeRewriteIdentities(rewrites));
};
