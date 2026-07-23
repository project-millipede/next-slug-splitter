'use client';

import { useMemo } from 'react';

import { AppHeader } from './components/AppHeader';
import { BenchmarkTable } from './components/BenchmarkTable';
import { TargetSelector } from './components/TargetSelector';
import { createRows } from './RowUtils';
import { useBenchmarkController } from './useBenchmarkController';

import styles from './BenchmarkApp.module.css';

export function BenchmarkApp() {
  const configuredRows = useMemo(createRows, []);
  const { rows, selection, measurement } =
    useBenchmarkController(configuredRows);

  return (
    <main className={styles.main}>
      <AppHeader
        isMeasurementRunning={measurement.isRunning}
        isRunningAll={measurement.isRunningAll}
        onClear={measurement.clear}
        onMeasureVisible={() => {
          void measurement.measureVisible();
        }}
      />

      <TargetSelector
        isMeasurementRunning={measurement.isRunning}
        onSelect={selection.selectTarget}
        selectedTargetId={selection.targetId}
      />

      <BenchmarkTable
        isMeasurementRunning={measurement.isRunning}
        rows={rows}
        selectedId={selection.rowId}
        onMeasureOne={(route, target) => {
          void measurement.measureOne(route, target);
        }}
        onSelect={selection.selectRow}
      />
    </main>
  );
}
