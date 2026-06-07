import { toRoutePath } from '../../../core/discovery';
import { isSingleLocaleConfig } from '../../../core/locale-config';
import type { HeavyRouteCandidate, LocaleConfig } from '../../../core/types';
import { dedupeRewriteIdentities } from './identity';
import { createAbsoluteRewriteRoutePath } from './route-path';
import type { RouteHandlerRewrite, RouteHandlerRewriteBuckets } from '../types';

export type RouteHandlerRewriteTargetConfig = {
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
};

export type RouteHandlerGeneratedDestinationOptions = {
  /**
   * Whether generated-handler destinations include the route locale as their
   * leading path segment.
   *
   * `false` or `undefined` keeps the conventional internal destination shape:
   * `/de/docs/a` -> `/docs/generated-handlers/a/de`
   *
   * `true` keeps App Router generated handlers inside the physical locale
   * subtree:
   * `/de/docs/a` -> `/de/docs/generated-handlers/a/de`
   *
   * This value is derived from generated-handler filesystem placement. It is
   * not a public routing option.
   */
  generatedHandlersAreLocaleScoped?: boolean;
};

type BuildRouteRewriteEntriesInput = RouteHandlerRewriteTargetConfig &
  RouteHandlerGeneratedDestinationOptions & {
    /**
     * Heavy routes that should be redirected to generated handler pages.
     */
    heavyRoutes: Array<HeavyRouteCandidate>;
  };

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
 * Build the generated-handler destination path for one heavy route.
 *
 * 1. Conventional generated output keeps destinations locale-less at the front:
 *    `/docs/generated-handlers/a/en`.
 * 2. Locale-subtree generated output includes the route locale as the leading
 *    destination segment:
 *    `/de/docs/generated-handlers/a/de`.
 * 3. `generatedHandlersAreLocaleScoped` is derived from generated-handler
 *    filesystem placement, not from a public routing option.
 *
 * @param routeLocale - Locale owned by the heavy route.
 * @param destinationBase - Generated-handler destination without an optional
 * leading route locale.
 * @param generatedHandlersAreLocaleScoped - Whether to include the route locale
 * as the leading generated-handler destination segment.
 * @returns Generated-handler rewrite destination.
 */
const createGeneratedHandlerRewriteDestination = (
  routeLocale: string,
  destinationBase: string,
  generatedHandlersAreLocaleScoped: boolean
): string => {
  if (!generatedHandlersAreLocaleScoped) {
    return destinationBase;
  }

  return createAbsoluteRewriteRoutePath('/', routeLocale, destinationBase);
};

/**
 * Builds the route-handler rewrite buckets for a single target configuration.
 *
 * @param heavyRoutes - The routing candidates for the target.
 * @param localeConfig - The locale configuration for the application.
 * @param routeBasePath - The target route base path.
 * @param handlerRouteSegment - Internal route segment that owns generated
 * handler pages.
 * @param generatedHandlersAreLocaleScoped - Whether generated-handler
 * destinations include the route locale as their leading path segment.
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
  handlerRouteSegment = 'generated-handlers',
  generatedHandlersAreLocaleScoped = false
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
    /**
     * Generated-handler destination:
     * 1. The destination is first built from the target route base path.
     * 2. The public source path owns the browser-visible locale shape.
     * 3. `handlerRelativePath` selects the concrete locale handler.
     * 4. Root targets are slash-normalized so `/` + `generated-handlers`
     *    does not become `//generated-handlers`.
     * 5. App targets with generated output inside the locale subtree include
     *    the route locale in front of this destination after the base path is
     *    built.
     *
     * Example, conventional destination:
     * `/de/docs/a/b` -> `/docs/generated-handlers/a/b/de`
     *
     * Example, App locale-subtree destination:
     * `/de/docs/a/b` -> `/de/docs/generated-handlers/a/b/de`
     */
    const destinationBase = createAbsoluteRewriteRoutePath(
      routeBasePath,
      handlerRouteSegment,
      entry.handlerRelativePath
    );
    const destination = createGeneratedHandlerRewriteDestination(
      entry.locale,
      destinationBase,
      generatedHandlersAreLocaleScoped
    );

    if (entry.locale === localeConfig.defaultLocale) {
      /**
       * Default locale, canonical URL:
       * 1. Every locale configuration has a default locale.
       * 2. The canonical public source URL is unprefixed.
       * 3. The destination follows the target's generated-output location.
       * 4. The handler path suffix selects the default locale.
       *
       * Example, conventional destination:
       * `/docs/a/b` -> `/docs/generated-handlers/a/b/en`
       *
       * Example, App locale-subtree destination:
       * `/docs/a/b` -> `/en/docs/generated-handlers/a/b/en`
       */
      rewrites.push(createRewrite(sourceRoutePath, destination));

      if (isSingleLocale) {
        continue;
      }

      /**
       * Default locale, explicit alias:
       * 1. This branch is still handling the default locale.
       * 2. Multi-locale configurations also support a locale-prefixed public
       *    source URL for the default locale.
       * 3. The destination follows the target's generated-output location.
       * 4. The handler path suffix selects the default locale.
       *
       * Example, conventional destination:
       * `/en/docs/a/b` -> `/docs/generated-handlers/a/b/en`
       *
       * Example, App locale-subtree destination:
       * `/en/docs/a/b` -> `/en/docs/generated-handlers/a/b/en`
       */
      rewritesOfDefaultLocale.push(
        createRewrite(`/${entry.locale}${sourceRoutePath}`, destination)
      );
      continue;
    }

    /*
     * Non-default locale:
     * 1. The public source URL is locale-prefixed.
     * 2. The destination follows the target's generated-output location.
     * 3. The handler path suffix selects the non-default locale.
     *
     * Example, conventional destination:
     * `/de/docs/a/b` -> `/docs/generated-handlers/a/b/de`
     *
     * Example, App locale-subtree destination:
     * `/de/docs/a/b` -> `/de/docs/generated-handlers/a/b/de`
     */
    rewrites.push(
      createRewrite(`/${entry.locale}${sourceRoutePath}`, destination)
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
  handlerRouteSegment,
  generatedHandlersAreLocaleScoped
}: BuildRouteRewriteEntriesInput): Array<RouteHandlerRewrite> => {
  const rewriteBuckets = buildRouteRewriteBuckets(
    heavyRoutes,
    localeConfig,
    routeBasePath,
    handlerRouteSegment,
    generatedHandlersAreLocaleScoped
  );

  return sortRouteHandlerRewrites(
    dedupeRewriteIdentities([
      ...rewriteBuckets.rewrites,
      ...rewriteBuckets.rewritesOfDefaultLocale
    ])
  );
};
