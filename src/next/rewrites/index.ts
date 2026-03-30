import { toRoutePath } from '../../core/discovery';
import type {
  HeavyRouteCandidate,
  LocaleConfig
} from '../../core/types';
import { dedupeRewriteIdentities } from './identity';
import type { RewriteRecord } from '../types';

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
  const rewrites: Array<RewriteRecord> = [];
  const shouldEmitDefaultLocalePrefixedAlias =
    localeConfig.locales.length > 1;

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

    if (entry.locale === localeConfig.defaultLocale) {
      /**
       * Default-locale routes follow two rules:
       *
       * 1. They always own the canonical locale-less public path.
       * 2. They only keep the explicit /<defaultLocale>/... alias when more
       *    than one locale is configured.
       */
      addRewrite(sourceRoutePath, destinationBase);

      if (shouldEmitDefaultLocalePrefixedAlias) {
        addRewrite(
          `/${entry.locale}${sourceRoutePath}`,
          `/${entry.locale}${destinationBase}`
        );
      }

      continue;
    }

    /**
     * Non-default-locale routes follow one rule:
     *
     * 1. They are only public through their explicit /<locale>/... prefix.
     */
    addRewrite(
      `/${entry.locale}${sourceRoutePath}`,
      `/${entry.locale}${destinationBase}`
    );
  }

  return sortRewriteRecords(dedupeRewriteIdentities(rewrites));
};
