'use client';

import { type MouseEvent, Fragment } from 'react';
import { Button } from '@base-ui/react/button';
import type {
  ComparisonDemoTarget,
  DemoRoute
} from '../../../lib/benchmark/catalog';

import { getRouteDisplayName } from '../measurement/format';
import type { RouteRow, RowState } from '../measurement/types';
import { createRowId } from '../RowUtils';
import { BundleImpact } from './BundleImpact';
import { DifferenceCell } from './DifferenceCell';
import { ExpandedRouteDetails } from './ExpandedRouteDetails';
import styles from './BenchmarkTable.module.css';

type BenchmarkTableProps = {
  isMeasurementRunning: boolean;
  rows: Array<RouteRow & { state: RowState }>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMeasureOne: (route: DemoRoute, target: ComparisonDemoTarget) => void;
};

export function BenchmarkTable({
  isMeasurementRunning,
  rows,
  selectedId,
  onSelect,
  onMeasureOne
}: BenchmarkTableProps) {
  return (
    <div className={styles.tableContainer}>
      <p className={styles.tableDescription}>
        Compares the build-selected JavaScript payload requested by each route
        load. Encoded JS is the transferred representation; decoded JS is its
        size after HTTP content decoding. Load duration comes from the same
        browser request. Shared framework, runtime, and layout chunks are
        excluded.
      </p>
      <table className={styles.table}>
        <colgroup>
          <col className={styles.routeColumn} />
          <col className={styles.impactColumn} />
          <col className={styles.differenceColumn} />
          <col className={styles.actionColumn} />
        </colgroup>
        <thead>
          <tr>
            <th>Route</th>
            <th>Encoded JS / load duration</th>
            <th>Difference</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ route, target, state }) => {
            const rowId = createRowId(route);
            const routeDisplayName = getRouteDisplayName(route);
            const isSelected = selectedId === rowId;
            const isMeasuring = state.phase === 'measuring';

            return (
              <Fragment key={rowId}>
                <tr
                  className={isSelected ? styles.selectedRow : undefined}
                  onClick={() => onSelect(isSelected ? null : rowId)}
                >
                  <td className={styles.routeCellColumn}>
                    <div className={styles.routeCell}>
                      <span className={styles.expandIndicator}>
                        {isSelected ? 'v' : '>'}
                      </span>
                      <div className={styles.routeCopy}>
                        <strong>{routeDisplayName}</strong>
                        <div>
                          <span
                            className={`${styles.kindBadge} ${
                              route.kind === 'heavy'
                                ? styles.kindBadgeHeavy
                                : styles.kindBadgeLight
                            }`}
                          >
                            {route.kind}
                          </span>
                          <code>{route.path}</code>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={styles.impactCellColumn}>
                    <BundleImpact state={state} />
                  </td>
                  <td className={styles.differenceCellColumn}>
                    <DifferenceCell result={state.result} />
                  </td>
                  <td className={styles.actionCellColumn}>
                    <Button
                      aria-busy={isMeasuring || undefined}
                      aria-label={`${
                        isMeasuring ? 'Measuring' : 'Measure'
                      } ${routeDisplayName}`}
                      className={styles.runButton}
                      data-running={isMeasuring ? '' : undefined}
                      disabled={isMeasurementRunning || isMeasuring}
                      focusableWhenDisabled
                      onClick={(event: MouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation();
                        onMeasureOne(route, target);
                      }}
                      type='button'
                    >
                      {isMeasuring ? 'Running' : 'Run'}
                    </Button>
                  </td>
                </tr>
                {isSelected ? (
                  <tr className={styles.expandedRow}>
                    <td colSpan={4}>
                      <ExpandedRouteDetails
                        route={route}
                        target={target}
                        state={state}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
