'use client';

import { Meter } from '@base-ui/react/meter';
import { Popover } from '@base-ui/react/popover';

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

/**
 * Label load duration and explain its sign and run-to-run variability.
 *
 * The popover opens on hover for pointer users and remains available through
 * focus or click for keyboard and touch users.
 */
function LoadDurationLabel() {
  return (
    <span className={`${styles.metricLabel} ${styles.loadDurationLabel}`}>
      Load duration
      <Popover.Root>
        <Popover.Trigger
          aria-label='About load duration measurements'
          className={styles.loadDurationInfoTrigger}
          onClick={event => {
            event.stopPropagation();
          }}
          openOnHover
          type='button'
        >
          i
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            className={styles.loadDurationInfoPositioner}
            sideOffset={8}
          >
            <Popover.Popup className={styles.loadDurationInfoPopup}>
              <Popover.Title className={styles.loadDurationInfoTitle}>
                Reading load duration
              </Popover.Title>
              <ul className={styles.loadDurationInfoList}>
                <li className={styles.loadDurationInfoItem}>
                  <span
                    className={`${styles.loadDurationInfoBadge} ${styles.loadDurationInfoBadgeNegative}`}
                  >
                    −
                  </span>
                  <p className={styles.loadDurationInfoCopy}>
                    <strong>Negative</strong> Faster in this run.
                  </p>
                </li>
                <li className={styles.loadDurationInfoItem}>
                  <span
                    className={`${styles.loadDurationInfoBadge} ${styles.loadDurationInfoBadgePositive}`}
                  >
                    +
                  </span>
                  <p className={styles.loadDurationInfoCopy}>
                    <strong>Positive</strong> Slower in this run; not
                    necessarily a regression.
                  </p>
                </li>
                <li className={styles.loadDurationInfoItem}>
                  <span
                    className={`${styles.loadDurationInfoBadge} ${styles.loadDurationInfoBadgeVariable}`}
                  >
                    ≈
                  </span>
                  <p className={styles.loadDurationInfoCopy}>
                    <strong>Timing varies</strong> Rerun and use Encoded JS as
                    the steadier payload comparison.
                  </p>
                </li>
              </ul>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </span>
  );
}

export function DifferenceCell({
  result
}: {
  result: MeasurementResult | null;
}) {
  if (result == null) {
    return (
      <div className={`${styles.cell} ${styles.emptyCell}`}>
        <div className={styles.meter}>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Encoded JS</span>
            <div className={styles.metricValues}>
              <strong className={styles.metricValue}>-</strong>
              <small className={styles.metricPercent}>-</small>
            </div>
          </div>
          <div
            aria-hidden='true'
            className={`${styles.meterTrack} ${styles.meterTrackPlaceholder}`}
          />
        </div>
        <div className={`${styles.metric} ${styles.secondaryMetric}`}>
          <LoadDurationLabel />
          <div className={styles.metricValues}>
            <strong className={styles.metricValue}>-</strong>
            <small className={styles.metricPercent}>-</small>
          </div>
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
        <div className={styles.metric}>
          <Meter.Label className={styles.metricLabel}>Encoded JS</Meter.Label>
          <div className={styles.metricValues}>
            <Meter.Value className={styles.metricValue}>
              {() => formatSignedByteDelta(result.encodedJsByteSizeDelta)}
            </Meter.Value>
            <small className={styles.metricPercent}>
              {formatSignedPercentDelta(encodedJsDeltaPercent)}
            </small>
          </div>
        </div>
        <Meter.Track className={styles.meterTrack}>
          <Meter.Indicator className={styles.meterIndicator} />
        </Meter.Track>
      </Meter.Root>
      <div className={`${styles.metric} ${styles.secondaryMetric}`}>
        <LoadDurationLabel />
        <div className={styles.metricValues}>
          <strong className={styles.metricValue}>
            {formatSignedDurationDelta(loadDurationDelta)}
          </strong>
          <small className={styles.metricPercent}>
            {formatSignedPercentDelta(loadDurationDeltaPercent)}
          </small>
        </div>
      </div>
    </div>
  );
}
