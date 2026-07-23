import type {
  ComparisonDemoTarget,
  ComparisonTargetId,
  DemoRoute
} from '../../../../lib/benchmark/catalog';
import type { MeasurementResult } from './result';

export type MeasurementError = {
  /**
   * Human-readable failure message for the row.
   */
  message: string;
};

type RowStateResultSnapshot = {
  /**
   * Last successful result kept stable while rerunning or after a failure.
   */
  result: MeasurementResult | null;
};

export type RowState =
  | (RowStateResultSnapshot & {
      /**
       * Row has no measurement currently running.
       */
      phase: 'idle';
    })
  | (RowStateResultSnapshot & {
      /**
       * Row is currently measuring. A previous successful result may still render.
       */
      phase: 'measuring';
    })
  | (RowStateResultSnapshot & {
      /**
       * Latest measurement failed.
       */
      phase: 'failed';
      error: MeasurementError;
    });

export type MeasurementPhase = RowState['phase'];

export type RouteRow = {
  /**
   * Public route displayed and measured in the table.
   */
  route: DemoRoute;
  /**
   * User-selectable comparison target that owns the route.
   */
  target: ComparisonDemoTarget;
};

export const DEFAULT_TARGET_ID: ComparisonTargetId = 'app-router-multi-locale';
