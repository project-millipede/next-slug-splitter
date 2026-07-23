'use client';

import { Meter } from '@base-ui/react/meter';

import {
  calculateDeltaPercent,
  calculateLoadDurationDelta,
  sumChunkLoadDurations,
  sumEncodedJsBytes
} from '../measurement/chunks';
import {
  formatSignedByteDelta,
  formatSignedDurationDelta,
  formatSignedPercentDelta,
  toSavingsMeterValue
} from '../measurement/format';
import type { MeasurementResult } from '../measurement/types';
import styles from './DifferenceCell.module.css';

/**
 * Select the visual encoded JavaScript difference tone for the summary card.
 *
 * @param deltaPercent Signed `baseline - splitter` percentage.
 * @returns CSS module class describing the difference band.
 */
const getEncodedJsTone = (deltaPercent: number | null): string => {
  if (deltaPercent == null) {
    return '';
  }

  if (deltaPercent <= 0) {
    return styles.encodedJsNonImprovement;
  }

  if (deltaPercent >= 80) {
    return styles.encodedJsSavingsHigh;
  }

  if (deltaPercent >= 30) {
    return styles.encodedJsSavingsMedium;
  }

  return styles.encodedJsSavingsLow;
};

export function DifferenceCell({
  result
}: {
  result: MeasurementResult | null;
}) {
  if (result == null) {
    return (
      <div className={`${styles.cell} ${styles.emptyCell}`}>
        <div className={styles.meter}>
          <span className={styles.meterLabel}>Encoded JS</span>
          <strong className={styles.meterValue}>-</strong>
          <small className={styles.meterPercent}>-</small>
          <div
            aria-hidden='true'
            className={`${styles.meterTrack} ${styles.meterTrackPlaceholder}`}
          />
        </div>
        <div className={`${styles.metric} ${styles.secondaryMetric}`}>
          <span>Load duration</span>
          <strong>-</strong>
          <small>-</small>
        </div>
      </div>
    );
  }

  const baselineEncodedJsTotal = sumEncodedJsBytes(result.baseline.chunks);
  const encodedJsDeltaPercent = calculateDeltaPercent(
    baselineEncodedJsTotal,
    result.encodedJsByteSizeDelta
  );
  const baselineLoadDuration = sumChunkLoadDurations(result.baseline.chunks);
  const splitterLoadDuration = sumChunkLoadDurations(result.splitter.chunks);
  const loadDurationDelta = calculateLoadDurationDelta(
    baselineLoadDuration,
    splitterLoadDuration
  );
  const loadDurationDeltaPercent = calculateDeltaPercent(
    baselineLoadDuration,
    loadDurationDelta
  );
  const tone = getEncodedJsTone(encodedJsDeltaPercent);

  return (
    <div className={`${styles.cell} ${tone}`}>
      <Meter.Root
        aria-valuetext={`Encoded JavaScript difference ${formatSignedPercentDelta(
          encodedJsDeltaPercent
        )}`}
        className={styles.meter}
        value={toSavingsMeterValue(encodedJsDeltaPercent)}
      >
        <Meter.Label className={styles.meterLabel}>Encoded JS</Meter.Label>
        <Meter.Value className={styles.meterValue}>
          {() => formatSignedByteDelta(result.encodedJsByteSizeDelta)}
        </Meter.Value>
        <small className={styles.meterPercent}>
          {formatSignedPercentDelta(encodedJsDeltaPercent)}
        </small>
        <Meter.Track className={styles.meterTrack}>
          <Meter.Indicator className={styles.meterIndicator} />
        </Meter.Track>
      </Meter.Root>
      <div className={`${styles.metric} ${styles.secondaryMetric}`}>
        <span>Load duration</span>
        <strong>{formatSignedDurationDelta(loadDurationDelta)}</strong>
        <small>{formatSignedPercentDelta(loadDurationDeltaPercent)}</small>
      </div>
    </div>
  );
}
