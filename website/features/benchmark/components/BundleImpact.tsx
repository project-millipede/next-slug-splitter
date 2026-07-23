'use client';

import { Meter } from '@base-ui/react/meter';
import { Progress } from '@base-ui/react/progress';

import {
  sumChunkLoadDurations,
  sumEncodedJsBytes
} from '../measurement/chunks';
import { formatBytes, formatDuration } from '../measurement/format';
import type { RowState } from '../measurement/types';
import styles from './BundleImpact.module.css';

type BundleBarProps = {
  label: string;
  value: number;
  loadDuration: number;
  percent: number | null;
  tone: 'baseline' | 'splitter';
  note?: string;
};

/**
 * Convert a route encoded JavaScript value into a stable bar width.
 *
 * The zero-byte case keeps a tiny visible marker so an intentional
 * zero-payload route is distinguishable from a missing measurement.
 *
 * @param value - Encoded JavaScript bytes for this bar.
 * @param percent - Size relative to the comparison baseline.
 * @returns Width percentage for the rendered bar fill.
 */
const getBundleBarWidth = (value: number, percent: number | null): number => {
  if (value === 0) {
    return 1;
  }

  return Math.max(2, Math.min(100, percent ?? 0));
};

const formatBundleAriaValue = (
  label: string,
  value: number,
  loadDuration: number,
  percent: number | null
): string => {
  if (value === 0) {
    return `${label}: no selected JavaScript payload, ${formatDuration(
      loadDuration
    )} load duration`;
  }

  const comparison =
    percent == null
      ? 'comparison unavailable'
      : `${Math.round(percent)}% of baseline`;

  return `${label}: ${formatBytes(value)} encoded JavaScript, ${formatDuration(
    loadDuration
  )} load duration, ${comparison}`;
};

function BundleBar({
  label,
  value,
  loadDuration,
  percent,
  tone,
  note
}: BundleBarProps) {
  const width = getBundleBarWidth(value, percent);

  return (
    <Meter.Root
      aria-valuetext={formatBundleAriaValue(
        label,
        value,
        loadDuration,
        percent
      )}
      className={`${styles.meter} ${styles[tone]}`}
      value={width}
    >
      <Meter.Label className={styles.meterLabel}>{label}</Meter.Label>
      <Meter.Value className={styles.meterValue}>
        {() => `${formatBytes(value)} / ${formatDuration(loadDuration)}`}
      </Meter.Value>
      <Meter.Track className={styles.meterTrack}>
        <Meter.Indicator className={styles.meterIndicator} />
      </Meter.Track>
      {note == null ? null : <div className={styles.meterNote}>{note}</div>}
    </Meter.Root>
  );
}

function MeasuringProgress() {
  return (
    <Progress.Root
      className={`${styles.progress} ${styles.running}`}
      value={null}
    >
      <Progress.Label className={styles.progressLabel}>
        Measuring without and with splitter...
      </Progress.Label>
      <Progress.Track className={styles.progressTrack}>
        <Progress.Indicator className={styles.progressIndicator} />
      </Progress.Track>
    </Progress.Root>
  );
}

export function BundleImpact({ state }: { state: RowState }) {
  const { result } = state;

  if (result == null) {
    if (state.phase === 'measuring') {
      return <MeasuringProgress />;
    }

    if (state.phase === 'failed') {
      return (
        <div className={`${styles.placeholder} ${styles.error}`}>
          {state.error.message}
        </div>
      );
    }

    return (
      <div className={styles.placeholder}>Run to compare both route loads.</div>
    );
  }

  const splitterEncodedJsTotal = sumEncodedJsBytes(result.splitter.chunks);
  const splitterLoadDuration = sumChunkLoadDurations(result.splitter.chunks);
  const baselineEncodedJsTotal = sumEncodedJsBytes(result.baseline.chunks);
  const baselineLoadDuration = sumChunkLoadDurations(result.baseline.chunks);
  const splitterEncodedJsPercent =
    baselineEncodedJsTotal <= 0
      ? null
      : (splitterEncodedJsTotal / baselineEncodedJsTotal) * 100;

  return (
    <div className={styles.impact}>
      <BundleBar
        label='Baseline'
        value={baselineEncodedJsTotal}
        loadDuration={baselineLoadDuration}
        percent={100}
        tone='baseline'
      />
      <BundleBar
        label='Splitter'
        value={splitterEncodedJsTotal}
        loadDuration={splitterLoadDuration}
        percent={splitterEncodedJsPercent}
        tone='splitter'
        note={
          splitterEncodedJsTotal === 0
            ? 'No selected JavaScript payload'
            : undefined
        }
      />
    </div>
  );
}
