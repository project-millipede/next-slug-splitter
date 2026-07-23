'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  ComparisonDemoTarget,
  ComparisonTargetId,
  DemoRoute
} from '../../lib/benchmark/catalog';

import { measureRoute } from './measurement/measure-route';
import {
  DEFAULT_TARGET_ID,
  type MeasurementError,
  type RouteRow,
  type RowState
} from './measurement/types';
import { createRowId } from './RowUtils';

/**
 * Identify the operation currently holding the benchmark measurement lock.
 *
 * Scopes:
 * 1. `row` represents one route measurement.
 * 2. `visible` represents the sequential Run-all-visible operation.
 */
type MeasurementRunScope = 'row' | 'visible';

/**
 * Combine one configured route row with its measurement lifecycle state.
 */
type StatefulRouteRow = RouteRow & {
  state: RowState;
};

/**
 * Expose the currently selected benchmark values and their commands.
 */
type BenchmarkSelection = {
  /**
   * Expanded route-row identifier, or null when all rows are collapsed.
   */
  rowId: string | null;
  /**
   * Comparison target currently displayed by the benchmark.
   */
  targetId: ComparisonTargetId;
  /**
   * Expand one route row or collapse the current selection.
   */
  selectRow: (rowId: string | null) => void;
  /**
   * Change the displayed comparison target.
   */
  selectTarget: (targetId: ComparisonTargetId) => void;
};

/**
 * Expose benchmark execution state and measurement commands.
 */
type BenchmarkMeasurement = {
  /**
   * Remove stored measurements when no operation is running.
   */
  clear: () => void;
  /**
   * Whether any measurement currently owns the shared lock.
   */
  isRunning: boolean;
  /**
   * Whether Run all visible currently owns the shared lock.
   */
  isRunningAll: boolean;
  /**
   * Measure one route row.
   */
  measureOne: (route: DemoRoute, target: ComparisonDemoTarget) => Promise<void>;
  /**
   * Measure every row visible for the selected target.
   */
  measureVisible: () => Promise<void>;
};

/**
 * Group the complete benchmark view model by responsibility.
 */
type BenchmarkController = {
  /**
   * Visible route rows combined with their current lifecycle states.
   */
  rows: StatefulRouteRow[];
  /**
   * Current target and expanded-row selection.
   */
  selection: BenchmarkSelection;
  /**
   * Measurement lifecycle and execution commands.
   */
  measurement: BenchmarkMeasurement;
};

/**
 * Row state used when a route has not been measured.
 */
const IDLE_ROW_STATE: RowState = {
  phase: 'idle',
  result: null
};

/**
 * Resolve the current state for one route row.
 *
 * Rules:
 * 1. Return the stored state when the row has already entered a lifecycle.
 * 2. Return the shared idle state when the sparse state record has no entry.
 *
 * @param rowStates - Measurement states indexed by stable route identifier.
 * @param rowId - Stable identifier of the route row being resolved.
 * @returns Stored row state or the default idle state.
 */
const resolveRowState = (
  rowStates: Readonly<Record<string, RowState>>,
  rowId: string
): RowState => {
  const state = rowStates[rowId];

  if (state === undefined) {
    return IDLE_ROW_STATE;
  }

  return state;
};

/**
 * Normalize an unknown thrown value into benchmark error metadata.
 *
 * @param error - Value caught while measuring a route.
 * @returns Human-readable measurement error metadata.
 */
const toMeasurementError = (error: unknown): MeasurementError => ({
  message: error instanceof Error ? error.message : 'Measurement failed.'
});

/**
 * Join visible route rows with their stored measurement states.
 *
 * Sequence:
 * 1. Resolve the stable identifier for each configured route.
 * 2. Resolve its stored state or the explicit idle state.
 * 3. Attach that state to the row consumed by the table.
 *
 * @param rows - Route rows visible for the currently selected target.
 * @param rowStates - Measurement states indexed by stable route identifier.
 * @returns Visible rows carrying the lifecycle state required by the table.
 */
const attachRowStates = (
  rows: ReadonlyArray<RouteRow>,
  rowStates: Readonly<Record<string, RowState>>
): StatefulRouteRow[] =>
  rows.map(row => {
    const rowId = createRowId(row.route);

    return {
      ...row,
      state: resolveRowState(rowStates, rowId)
    };
  });

/**
 * Coordinate benchmark selection, row state, and route measurements.
 *
 * Responsibilities:
 * 1. Filter the configured rows to the currently selected comparison target.
 * 2. Join visible rows with their current measurement lifecycle states.
 * 3. Acquire one synchronous lock for individual and Run-all-visible commands.
 * 4. Measure visible rows sequentially so separate routes do not compete for
 *    browser, network, or server resources.
 * 5. Preserve the previous successful result during reruns and failures.
 * 6. Expose rows, selection, and measurement through separate domain groups.
 *
 * @param configuredRows - Stable complete route-row configuration from which
 * the currently visible target rows are selected.
 * @returns Grouped benchmark rows, selection state, and measurement commands.
 */
export const useBenchmarkController = (
  configuredRows: ReadonlyArray<RouteRow>
): BenchmarkController => {
  const measurementLockRef = useRef(false);
  const [selectedTargetId, setSelectedTargetId] =
    useState<ComparisonTargetId>(DEFAULT_TARGET_ID);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [activeMeasurementScope, setActiveMeasurementScope] =
    useState<MeasurementRunScope | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const visibleRows = useMemo(
    () => configuredRows.filter(row => row.target.id === selectedTargetId),
    [configuredRows, selectedTargetId]
  );
  const rowsWithState = useMemo(
    () => attachRowStates(visibleRows, rowStates),
    [rowStates, visibleRows]
  );

  /**
   * Run one benchmark operation while excluding every other measurement.
   *
   * Sequence:
   * 1. Acquire the ref-based lock synchronously before React renders disabled
   *    controls.
   * 2. Publish the active scope so the interface reflects the lock.
   * 3. Await the complete row or visible-row operation.
   * 4. Release both the synchronous lock and rendered active state.
   *
   * @param scope - Kind of measurement operation acquiring the lock.
   * @param operation - Complete asynchronous operation protected by the lock.
   * @returns Promise that settles after the operation, or resolves immediately
   * when another measurement already owns the lock.
   */
  const runWithMeasurementLock = useCallback(
    async (
      scope: MeasurementRunScope,
      operation: () => Promise<void>
    ): Promise<void> => {
      if (measurementLockRef.current) {
        return;
      }

      measurementLockRef.current = true;
      setActiveMeasurementScope(scope);

      try {
        await operation();
      } finally {
        measurementLockRef.current = false;
        setActiveMeasurementScope(null);
      }
    },
    []
  );

  /**
   * Measure one benchmark row and commit its lifecycle state.
   *
   * Sequence:
   * 1. Resolve the row state before the new measurement starts.
   * 2. Mark the row as measuring while retaining its previous result.
   * 3. Measure the splitter and baseline route loads.
   * 4. Store the result, or preserve the prior result alongside an error.
   *
   * Errors are recorded instead of rethrown so Run all visible can continue
   * with its remaining rows.
   *
   * @param route - Public demo route represented by the row.
   * @param target - Comparison target that owns the route.
   * @returns Promise that resolves after the row state has been updated.
   */
  const runMeasurement = useCallback(
    async (route: DemoRoute, target: ComparisonDemoTarget): Promise<void> => {
      const rowId = createRowId(route);

      setRowStates(current => {
        const previousState = resolveRowState(current, rowId);

        return {
          ...current,
          [rowId]: {
            phase: 'measuring',
            result: previousState.result
          }
        };
      });

      try {
        const result = await measureRoute(route, target);

        setRowStates(current => ({
          ...current,
          [rowId]: {
            phase: 'idle',
            result
          }
        }));
      } catch (error) {
        setRowStates(current => {
          const previousState = resolveRowState(current, rowId);

          return {
            ...current,
            [rowId]: {
              phase: 'failed',
              result: previousState.result,
              error: toMeasurementError(error)
            }
          };
        });
      }
    },
    []
  );

  /**
   * Measure every currently visible row without overlapping route loads.
   *
   * Sequence:
   * 1. Acquire the shared lock for the complete operation.
   * 2. Collapse any expanded row details.
   * 3. Await each row before starting the next visible row.
   * 4. Release the lock after every visible row has settled.
   *
   * @returns Promise that resolves after all visible rows have been processed,
   * or immediately when another measurement already owns the lock.
   */
  const measureVisible = useCallback(
    (): Promise<void> =>
      runWithMeasurementLock('visible', async () => {
        setSelectedRowId(null);

        for (const row of visibleRows) {
          await runMeasurement(row.route, row.target);
        }
      }),
    [runMeasurement, runWithMeasurementLock, visibleRows]
  );

  /**
   * Measure one row under the shared measurement lock.
   *
   * @param route - Public demo route represented by the row.
   * @param target - Comparison target that owns the route.
   * @returns Promise that resolves after the row measurement settles, or
   * immediately when another measurement already owns the lock.
   */
  const measureOne = useCallback(
    (route: DemoRoute, target: ComparisonDemoTarget): Promise<void> =>
      runWithMeasurementLock('row', () => runMeasurement(route, target)),
    [runMeasurement, runWithMeasurementLock]
  );

  /**
   * Clear completed row results when no measurement is active.
   *
   * Sequence:
   * 1. Ignore the command while an asynchronous measurement owns the lock.
   * 2. Remove all stored row states when no operation can restore them later.
   *
   * @returns Nothing. Existing results remain intact while measuring.
   */
  const clearMeasurements = useCallback((): void => {
    if (measurementLockRef.current) {
      return;
    }

    setRowStates({});
  }, []);

  /**
   * Select another comparison target when no measurement is active.
   *
   * Sequence:
   * 1. Ignore the command while the current target owns a measurement.
   * 2. Select the requested comparison target.
   * 3. Clear results and expanded-row state belonging to the previous target.
   *
   * @param targetId - Comparison target selected by the user.
   * @returns Nothing. The selection remains unchanged while measuring.
   */
  const selectTarget = useCallback((targetId: ComparisonTargetId): void => {
    if (measurementLockRef.current) {
      return;
    }

    setSelectedTargetId(targetId);
    setRowStates({});
    setSelectedRowId(null);
  }, []);

  /**
   * Select one row for expanded details or collapse the current selection.
   *
   * @param rowId - Stable row identifier to expand, or null to collapse all.
   * @returns Nothing.
   */
  const selectRow = useCallback((rowId: string | null): void => {
    setSelectedRowId(rowId);
  }, []);

  return {
    rows: rowsWithState,
    selection: {
      rowId: selectedRowId,
      targetId: selectedTargetId,
      selectRow,
      selectTarget
    },
    measurement: {
      clear: clearMeasurements,
      isRunning: activeMeasurementScope != null,
      isRunningAll: activeMeasurementScope === 'visible',
      measureOne,
      measureVisible
    }
  };
};
