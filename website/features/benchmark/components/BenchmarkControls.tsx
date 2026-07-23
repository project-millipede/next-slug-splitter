'use client';

import { Toolbar } from '@base-ui/react/toolbar';

import styles from './BenchmarkControls.module.css';

type BenchmarkControlsProps = {
  isMeasurementRunning: boolean;
  isRunningAll: boolean;
  onMeasureVisible: () => void;
  onClear: () => void;
};

export function BenchmarkControls({
  isMeasurementRunning,
  isRunningAll,
  onMeasureVisible,
  onClear
}: BenchmarkControlsProps) {
  return (
    <Toolbar.Root className={styles.toolbar} aria-label='Benchmark actions'>
      <Toolbar.Button
        className={`${styles.button} ${styles.primaryButton}`}
        disabled={isMeasurementRunning}
        focusableWhenDisabled
        onClick={onMeasureVisible}
        type='button'
      >
        {isRunningAll ? 'Running all' : 'Run all visible'}
      </Toolbar.Button>
      <Toolbar.Button
        className={`${styles.button} ${styles.secondaryButton}`}
        disabled={isMeasurementRunning}
        focusableWhenDisabled
        onClick={onClear}
        type='button'
      >
        Clear
      </Toolbar.Button>
    </Toolbar.Root>
  );
}
