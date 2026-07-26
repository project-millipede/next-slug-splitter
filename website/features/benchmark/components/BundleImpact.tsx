'use client';

import { Meter } from '@base-ui/react/meter';

import {
  sumChunkLoadDurations,
  sumEncodedJsBytes
} from '../measurement/chunks';
import { formatBytes, formatDuration } from '../measurement/format';
import type { MeasurementResult, RowState } from '../measurement/types';
import styles from './BundleImpact.module.css';

type BundleMeasurement = {
  encodedJsByteSize: number;
  loadDurationMs: number;
};

type BundleImpactMeasurement = {
  baseline: BundleMeasurement;
  splitter: BundleMeasurement;
};

type BundleBarProps = {
  label: string;
  measurement: BundleMeasurement | null;
  percent: number | null;
  tone: 'baseline' | 'splitter';
};

/**
 * Longest normal status message rendered below the two meters.
 *
 * The same copy remains invisibly present in every state so typography and
 * available width determine the reserved status height intrinsically.
 */
const NO_SELECTED_PAYLOAD_MESSAGE = 'No selected JavaScript payload';

/**
 * Derive the paired bundle measurements from a completed route result.
 *
 * This helper owns the distinction between two states:
 *
 * 1. A missing result means the route has not produced a measurement yet and
 *    returns `null`.
 * 2. An empty measured chunk collection is valid evidence and produces zero
 *    bytes and zero duration.
 *
 * Keeping that distinction here allows the lower-level sum functions to
 * continue accepting only measured chunk collections and returning numbers.
 *
 * @param result Completed route measurement, when available.
 * @returns Paired baseline and splitter measurements, or `null`.
 */
const getBundleImpactMeasurement = (
  result: MeasurementResult | null
): BundleImpactMeasurement | null => {
  if (result == null) {
    return null;
  }

  return {
    baseline: {
      encodedJsByteSize: sumEncodedJsBytes(result.baseline.chunks),
      loadDurationMs: sumChunkLoadDurations(result.baseline.chunks)
    },
    splitter: {
      encodedJsByteSize: sumEncodedJsBytes(result.splitter.chunks),
      loadDurationMs: sumChunkLoadDurations(result.splitter.chunks)
    }
  };
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

function BundleBar({ label, measurement, percent, tone }: BundleBarProps) {
  const width =
    measurement == null
      ? 0
      : getBundleBarWidth(measurement.encodedJsByteSize, percent);
  const displayedValue =
    measurement == null
      ? '-'
      : `${formatBytes(measurement.encodedJsByteSize)} / ${formatDuration(
          measurement.loadDurationMs
        )}`;

  return (
    <Meter.Root
      aria-hidden={measurement == null ? true : undefined}
      aria-valuetext={
        measurement == null
          ? undefined
          : formatBundleAriaValue(
              label,
              measurement.encodedJsByteSize,
              measurement.loadDurationMs,
              percent
            )
      }
      className={`${styles.meter} ${styles[tone]}`}
      value={width}
    >
      <Meter.Label className={styles.meterLabel}>{label}</Meter.Label>
      <Meter.Value className={styles.meterValue}>
        {() => displayedValue}
      </Meter.Value>
      <Meter.Track className={styles.meterTrack}>
        <Meter.Indicator
          className={`${styles.meterIndicator} ${
            measurement == null ? styles.meterIndicatorPlaceholder : ''
          }`}
        />
      </Meter.Track>
    </Meter.Root>
  );
}

export function BundleImpact({ state }: { state: RowState }) {
  const { result } = state;
  const isMeasuring = state.phase === 'measuring';
  const measurement = getBundleImpactMeasurement(result);
  const splitterEncodedJsPercent =
    measurement == null || measurement.baseline.encodedJsByteSize <= 0
      ? null
      : (measurement.splitter.encodedJsByteSize /
          measurement.baseline.encodedJsByteSize) *
        100;
  let statusMessage: string | null;
  let statusTone: string;

  if (isMeasuring) {
    statusMessage = 'Measuring…';
    statusTone = '';
  } else if (state.phase === 'failed') {
    statusMessage = state.error.message;
    statusTone = styles.error;
  } else if (measurement != null) {
    statusMessage =
      measurement.splitter.encodedJsByteSize === 0
        ? NO_SELECTED_PAYLOAD_MESSAGE
        : null;
    statusTone = '';
  } else {
    statusMessage = 'Run to compare.';
    statusTone = '';
  }

  return (
    <div className={styles.impact}>
      <BundleBar
        label='Baseline'
        measurement={measurement == null ? null : measurement.baseline}
        percent={measurement == null ? null : 100}
        tone='baseline'
      />
      <BundleBar
        label='Splitter'
        measurement={measurement == null ? null : measurement.splitter}
        percent={splitterEncodedJsPercent}
        tone='splitter'
      />
      <div
        aria-atomic='true'
        aria-live='polite'
        className={`${styles.status} ${statusTone}`}
      >
        <span aria-hidden='true' className={styles.statusReservation}>
          {NO_SELECTED_PAYLOAD_MESSAGE}
        </span>
        {statusMessage == null ? null : (
          <span className={styles.statusMessage}>{statusMessage}</span>
        )}
      </div>
    </div>
  );
}
