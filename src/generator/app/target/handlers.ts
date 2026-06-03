import {
  clearRouteHandlerOutputDirectory,
  synchronizeRenderedRouteHandlerPage
} from '../../shared/protocol/output-lifecycle';
import {
  renderAppRouteHandlerPage,
  type AppRouteHandlerEmitBase
} from '../protocol/rendered-page';
import { isMultiLocaleConfig } from '../../../core/locale-config';

import type { LocaleConfig, PlannedHeavyRoute } from '../../../core/types';

/** Input for {@link emitAppRouteHandlerPages}. */
type EmitAppRouteHandlerPagesInput = AppRouteHandlerEmitBase & {
  /** Heavy routes selected for handler generation. */
  heavyRoutes: Array<PlannedHeavyRoute>;
  /**
   * Normalized locale config. Multi-locale targets bake each handler's locale
   * into its `handlerParams`; single-locale targets keep the slug-only bag.
   */
  localeConfig: LocaleConfig;
};

/**
 * Rebuild an App target's generated-handler directory from its heavy-route set.
 *
 * @remarks
 * Each heavy route renders one concrete `page.tsx` (`dynamicParams = false`).
 * For multi-locale targets the route's locale is baked into `handlerParams` so
 * the shared route contract loads the correct per-locale data; single-locale
 * targets keep today's slug-only bag.
 *
 * @param input - Handler emission input for one App target.
 * @returns A promise that resolves once all handler pages are written to disk.
 */
export const emitAppRouteHandlerPages = async ({
  paths,
  heavyRoutes,
  emitFormat,
  routeContract,
  handlerRouteParam,
  routeBasePath,
  routeModuleContract,
  localeConfig
}: EmitAppRouteHandlerPagesInput): Promise<void> => {
  await clearRouteHandlerOutputDirectory(paths.generatedDir);

  // Multi-locale targets carry locale in handlerParams (see
  // renderAppRouteHandlerPage); single-locale targets keep the slug-only bag,
  // preserving today's output exactly.
  const includeLocaleParam = isMultiLocaleConfig(localeConfig);

  const renderedPages = heavyRoutes.map(entry =>
    renderAppRouteHandlerPage({
      paths,
      heavyRoute: entry,
      emitFormat,
      routeContract,
      handlerRouteParam,
      routeBasePath,
      routeModuleContract,
      includeLocaleParam
    })
  );

  for (const page of renderedPages) {
    await synchronizeRenderedRouteHandlerPage(page);
  }
};
