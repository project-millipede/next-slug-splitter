import { Counter } from '../../lib/components/counter';
import { Chart } from '../../lib/components/chart';
import { DataTable } from '../../lib/components/data-table';

export { Counter, Chart, DataTable };

const routeHandlerComponents = {
  Counter,
  Chart,
  DataTable
} as const;

/**
 * Demo key space shared by the component package boundary and the route-handler
 * metadata registry.
 *
 * The metadata file imports this type so any keyed metadata entry must refer to
 * a real named export from `@demo/components`.
 */
export type DemoRouteHandlerComponentKey = keyof typeof routeHandlerComponents;
