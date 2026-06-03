/**
 * Orchestrates route-handler file generation and writes emitted sources to disk.
 *
 * @remarks
 * This file stays outside the syntax-emission layer. Its responsibility is
 * path resolution, component-entry selection, factory import rewriting, and
 * file persistence. Generated source text continues to come from the renderer
 * layer.
 *
 * In the current phase-local architecture this module rebuilds one target's
 * handler output directory from the current heavy-route set:
 * 1. clear the target handlers directory,
 * 2. group the heavy routes into emission units, collapsing same-component-set
 *    locale groups into one merged handler (the build-only `K = 1` merge),
 * 3. render one page per emission unit, and
 * 4. write those rendered pages to disk.
 *
 * This module does not decide whether a route is heavy. It assumes
 * `heavyRoutes` is already the final generation set for the target.
 */
import {
  clearRouteHandlerOutputDirectory,
  synchronizeRenderedRouteHandlerPage
} from '../../shared/protocol/output-lifecycle';
import {
  renderRouteHandlerPage,
  type RouteHandlerEmitBase
} from '../protocol/rendered-page';
import { groupHeavyRoutesForEmission } from '../../../core/handler-emission-grouping';
import { isMultiLocaleConfig } from '../../../core/locale-config';

import type { LocaleConfig, PlannedHeavyRoute } from '../../../core/types';

/** Input for {@link emitRouteHandlerPages}. */
type EmitRouteHandlerPagesInput = RouteHandlerEmitBase & {
  /** Heavy routes selected for handler generation. */
  heavyRoutes: Array<PlannedHeavyRoute>;
  /**
   * Normalized locale config; drives both the per-locale vs concrete leaf
   * decision and the build-only `K = 1` merge grouping.
   */
  localeConfig: LocaleConfig;
};

/**
 * Rebuild a target's generated-handler directory from its heavy-route set.
 *
 * @remarks
 * Heavy routes are first grouped into emission units (see
 * {@link groupHeavyRoutesForEmission}):
 * 1. a `single` unit renders one per-locale handler — concrete at `L = 1`, an
 *    optional catch-all leaf at `L > 1`;
 * 2. a `merged` unit renders one locale-less handler covering a whole
 *    same-component-set locale group (the build-only `K = 1` merge).
 *
 * @param input - Handler emission input for one target.
 * @returns A promise that resolves once all handler pages are written to disk.
 */
export const emitRouteHandlerPages = async ({
  paths,
  heavyRoutes,
  emitFormat,
  routeContract,
  handlerRouteParam,
  routeBasePath,
  localeConfig
}: EmitRouteHandlerPagesInput): Promise<void> => {
  // Generate mode is intentionally phase-local and fresh. Clearing the target
  // handlers directory up front keeps build/generate independent from prior
  // dev artifacts before the current heavy-route set is written back to disk.
  await clearRouteHandlerOutputDirectory(paths.generatedDir);

  const isMultiLocale = isMultiLocaleConfig(localeConfig);

  const renderedPages = groupHeavyRoutesForEmission(
    heavyRoutes,
    localeConfig
  ).map(unit => {
    // getStaticPathsLocales is the whole single/merged distinction at this
    // layer: a merged group enumerates every locale it owns at its locale-less
    // destination; a lone/distinct-set route enumerates only its own locale,
    // and only at L > 1 (at L = 1 it stays a concrete page).
    const emission =
      unit.kind === 'merged'
        ? {
            route: unit.route,
            handlerRelativePath: unit.handlerRelativePath,
            getStaticPathsLocales: unit.locales
          }
        : {
            route: unit.route,
            handlerRelativePath: unit.route.handlerRelativePath,
            getStaticPathsLocales: isMultiLocale ? [unit.route.locale] : []
          };

    return renderRouteHandlerPage({
      paths,
      emitFormat,
      routeContract,
      handlerRouteParam,
      routeBasePath,
      ...emission
    });
  });

  for (const page of renderedPages) {
    await synchronizeRenderedRouteHandlerPage(page);
  }
};
