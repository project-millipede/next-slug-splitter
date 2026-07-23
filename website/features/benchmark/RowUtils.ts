import {
  DEMO_ROUTES,
  findComparisonDemoTarget,
  type DemoRoute
} from '../../lib/benchmark/catalog';

import type { RouteRow } from './measurement/types';

/**
 * Create a stable identifier for one benchmark route row.
 *
 * The identifier combines the comparison target and public route so routes
 * with the same pathname in different router targets retain independent state.
 *
 * @param route Demo route displayed in the measurement table.
 * @returns Stable identifier scoped by target and route path.
 */
export const createRowId = (route: DemoRoute): string =>
  `${route.targetId}:${route.path}`;

/**
 * Create the configured rows rendered by the benchmark table.
 *
 * Sequence:
 *
 * 1. Read each configured demo route.
 * 2. Resolve the comparison target referenced by that route.
 * 3. Fail when benchmark configuration references an unknown target.
 * 4. Join the route and target into the table-row model.
 *
 * @returns Configured benchmark route rows.
 * @throws When a configured route references a missing comparison target.
 */
export const createRows = (): RouteRow[] =>
  DEMO_ROUTES.map(route => {
    const target = findComparisonDemoTarget(route.targetId);

    if (target == null) {
      throw new Error(`Missing comparison target "${route.targetId}".`);
    }

    return {
      route,
      target
    };
  });
