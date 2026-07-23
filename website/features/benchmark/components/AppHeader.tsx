import { BenchmarkControls } from './BenchmarkControls';

import styles from './AppHeader.module.css';

type AppHeaderProps = {
  isMeasurementRunning: boolean;
  isRunningAll: boolean;
  onMeasureVisible: () => void;
  onClear: () => void;
};

export function AppHeader({
  isMeasurementRunning,
  isRunningAll,
  onMeasureVisible,
  onClear
}: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>next-slug-splitter</p>
        <h1 className={styles.title}>Live Benchmark</h1>
      </div>
      <BenchmarkControls
        isMeasurementRunning={isMeasurementRunning}
        isRunningAll={isRunningAll}
        onClear={onClear}
        onMeasureVisible={onMeasureVisible}
      />
    </header>
  );
}
