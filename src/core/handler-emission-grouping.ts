/**
 * Build-time grouping of planned heavy routes into emission units.
 *
 * @remarks
 * Phase 1 emits one generated handler per `(locale, slug)`. When several heavy
 * locales of the *same* slug resolve to the *same* component set (`K = 1`),
 * those per-locale handlers are identical except their locale marker. This
 * helper groups such locales so the emitter can collapse them into a single
 * merged handler (locale-less leaf + multi-locale `getStaticPaths`), reducing
 * the number of generated route modules a many-locale site produces.
 *
 * This is a **build-only** optimization:
 * 1. It operates purely on the already-planned `heavyPaths` (no I/O), so it
 *    scales to any number of locales.
 * 2. The lazy dev/proxy path emits one route at a time and never calls this, so
 *    dev keeps the per-locale Phase 1 shape.
 */

import { isMultiLocaleConfig } from './locale-config';
import { toHandlerRelativePath } from './discovery';

import type { LocaleConfig, PlannedHeavyRoute } from './types';

/**
 * One unit of generated-handler emission.
 *
 * - `single`: emit one handler for exactly one `(locale, slug)` — the Phase 1
 *   shape. Used for lone-locale routes and for any locale whose component set
 *   is not shared with another locale of the same slug.
 * - `merged`: emit ONE handler covering several locales of one slug that all
 *   resolve to the same component set. `route` is the representative carrying
 *   the shared component payload; `locales` are the locales it owns;
 *   `handlerRelativePath` is the locale-less emit/rewrite destination.
 */
export type HandlerEmissionUnit =
  | { kind: 'single'; route: PlannedHeavyRoute }
  | {
      kind: 'merged';
      slugArray: Array<string>;
      locales: Array<string>;
      handlerRelativePath: string;
      route: PlannedHeavyRoute;
    };

/**
 * Compute a stable identity for a route's emitted component payload. Two heavy
 * routes of the same slug are mergeable into one handler iff their identities
 * are equal.
 *
 * The identity captures every input that affects the emitted handler body, so
 * genuinely different routes can never collide into a false merge:
 * 1. the sorted loadable component keys,
 * 2. the resolved factory import,
 * 3. the resolved factory bindings (or `null` when absent),
 * 4. each component entry's key, resolved import spec, and inline metadata.
 *
 * Arrays are sorted so locale-independent ordering differences never block an
 * otherwise valid merge.
 *
 * @param route - Planned heavy route whose component payload is fingerprinted.
 * @returns A stable string identity; equal strings denote an identical payload.
 */
const componentSetIdentity = (route: PlannedHeavyRoute): string =>
  JSON.stringify([
    [...route.usedLoadableComponentKeys].sort(),
    route.factoryImport,
    route.factoryBindings ?? null,
    [...route.componentEntries]
      .map(entry => [entry.key, entry.componentImport, entry.metadata])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
  ]);

/**
 * Bucket items by a derived string key, preserving first-seen order of both the
 * buckets and the items within each bucket.
 *
 * @typeParam T - Element type of the input collection.
 * @param items - Items to group.
 * @param key - Derives the grouping key for one item.
 * @returns A map from each key to the items, in insertion order, that produced it.
 */
const groupBy = <T>(
  items: ReadonlyArray<T>,
  key: (item: T) => string
): Map<string, Array<T>> => {
  const groups = new Map<string, Array<T>>();
  for (const item of items) {
    const groupKey = key(item);
    const existing = groups.get(groupKey);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(groupKey, [item]);
    }
  }
  return groups;
};

/**
 * Group planned heavy routes into emission units, collapsing same-component-set
 * locale groups of one slug (`K = 1`) into a single merged unit.
 *
 * Algorithm:
 * 1. Single-locale apps can never merge (one locale per slug), so every route
 *    is returned as its own `single` unit.
 * 2. Otherwise bucket routes by slug, then sub-bucket each slug by
 *    component-set identity (see {@link componentSetIdentity}).
 * 3. A sub-bucket with two or more locales becomes one `merged` unit (locale-
 *    less destination, all owned locales); a lone route stays a `single` unit.
 *
 * Pure and I/O-free — it inspects only the already-planned routes, so it scales
 * to any locale count. Build-only; the lazy dev/proxy path never calls it.
 *
 * @param heavyPaths - All planned heavy routes for one target, per `(locale, slug)`.
 * @param localeConfig - Normalized locale config for the target.
 * @returns Emission units in slug/first-seen order; all `single` for single-locale apps.
 */
export const groupHeavyRoutesForEmission = (
  heavyPaths: ReadonlyArray<PlannedHeavyRoute>,
  localeConfig: LocaleConfig
): Array<HandlerEmissionUnit> => {
  // A single-locale app has exactly one locale per slug, so no two routes ever
  // share a slug and nothing is mergeable. Fast-path to all-`single`.
  if (!isMultiLocaleConfig(localeConfig)) {
    return heavyPaths.map(route => ({ kind: 'single', route }));
  }

  const units: Array<HandlerEmissionUnit> = [];

  for (const slugRoutes of groupBy(heavyPaths, route =>
    route.slugArray.join(' ')
  ).values()) {
    for (const members of groupBy(slugRoutes, componentSetIdentity).values()) {
      if (members.length < 2) {
        units.push({ kind: 'single', route: members[0] });
        continue;
      }

      const representative = members[0];
      units.push({
        kind: 'merged',
        slugArray: representative.slugArray,
        locales: members.map(member => member.locale).sort(),
        // Locale-less destination: the merged leaf owns `<slug>` directly and
        // pins each locale through `getStaticPaths` instead of the path.
        handlerRelativePath: toHandlerRelativePath(
          representative.locale,
          representative.slugArray,
          { includeLocaleLeaf: false }
        ),
        route: representative
      });
    }
  }

  return units;
};

/**
 * Expand emission units into per-`(locale, slug)` heavy routes whose
 * `handlerRelativePath` is the *effective emit destination* — locale-less for
 * merged groups, unchanged for single units.
 *
 * Feed the result to rewrite construction so that:
 * 1. every locale of a merged group rewrites to the single locale-less
 *    destination its merged handler is emitted at, and
 * 2. the heavy-route lookup keeps using the original per-locale `heavyPaths`
 *    (this transform only rewrites destinations, never ownership).
 *
 * @param units - Emission units from {@link groupHeavyRoutesForEmission}.
 * @returns One heavy route per owned `(locale, slug)`, with destinations corrected.
 */
export const toRewriteHeavyPaths = (
  units: ReadonlyArray<HandlerEmissionUnit>
): Array<PlannedHeavyRoute> =>
  units.flatMap(unit =>
    unit.kind === 'single'
      ? [unit.route]
      : unit.locales.map(locale => ({
          ...unit.route,
          locale,
          handlerRelativePath: unit.handlerRelativePath
        }))
  );
