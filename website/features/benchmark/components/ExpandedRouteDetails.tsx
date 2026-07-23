'use client';

import { Meter } from '@base-ui/react/meter';

import {
  toZoneUrl,
  type ComparisonDemoTarget,
  type DemoRoute
} from '../../../lib/benchmark/catalog';

import {
  calculateDeltaPercent,
  sumDecodedJsBytes
} from '../measurement/chunks';
import {
  formatBytes,
  formatDuration,
  formatSignedByteDelta,
  formatSignedPercentDelta,
  getChunkLabel,
  toSavingsMeterValue
} from '../measurement/format';
import type {
  MeasuredJsChunk,
  MeasurementResult,
  RowState
} from '../measurement/types';
import { ChunkDiagnostics } from './ChunkDiagnostics';
import styles from './ExpandedRouteDetails.module.css';

type ExpandedRouteDetailsProps = {
  route: DemoRoute;
  target: ComparisonDemoTarget;
  state: RowState;
};

/**
 * Resolve the baseline URL shown in expanded route details.
 *
 * @param result Completed measurement result, when available.
 * @param route Public demo route being inspected.
 * @returns Baseline zone URL, or `-` before measurement.
 */
const getBaselineRoutePath = (
  result: MeasurementResult | null,
  route: DemoRoute
): string =>
  result == null ? '-' : toZoneUrl(result.baselineTarget, route.path);

/**
 * Resolve the rewrite-target fallback shown before or after measurement.
 *
 * @param result Completed measurement result, when available.
 * @returns Placeholder before measurement or the intentional no-rewrite label.
 */
const getRewriteTargetLabel = (result: MeasurementResult | null): string =>
  result == null ? '-' : 'No generated-handler rewrite';

/**
 * Format the exact splitter payload for the compact technical summary.
 *
 * @param chunks Zero-or-one browser-observed splitter payloads.
 * @returns Selected payload label or an explicit zero-payload label.
 */
const getSplitterPayloadSummary = (chunks: MeasuredJsChunk[]): string => {
  const [payload] = chunks;
  return payload == null ? 'No selected payload' : getChunkLabel(payload.path);
};

type DecodedJsSizeSummaryProps = {
  baselineTotal: number;
  splitterTotal: number;
  deltaTotal: number;
};

type MeasuredRouteDetailsProps = {
  result: MeasurementResult;
  splitterChunks: MeasuredJsChunk[];
  baselineChunks: MeasuredJsChunk[];
};

/**
 * Render decoded JavaScript as browser-processing context.
 *
 * Encoded JavaScript size remains the main row metric. This expanded summary
 * keeps decoded bytes visible because they are the input to parsing,
 * compilation, and evaluation after the transferred representation arrives.
 * The difference remains signed so regressions cannot be hidden as zero.
 */
function DecodedJsSizeSummary({
  baselineTotal,
  splitterTotal,
  deltaTotal
}: DecodedJsSizeSummaryProps) {
  const deltaPercent = calculateDeltaPercent(baselineTotal, deltaTotal);
  const differenceClassName = deltaTotal < 0 ? styles.regression : undefined;

  return (
    <section className={styles.decodedJsSizeSummary}>
      <div>
        <h3>Decoded JavaScript size</h3>
        <p>
          JavaScript size after HTTP content decoding; context for parse,
          compile, and evaluation work.
        </p>
      </div>
      <dl>
        <div>
          <dt>Baseline</dt>
          <dd>{formatBytes(baselineTotal)}</dd>
        </div>
        <div>
          <dt>Splitter</dt>
          <dd>{formatBytes(splitterTotal)}</dd>
        </div>
        <div className={differenceClassName}>
          <dt>Difference</dt>
          <dd>
            {formatSignedByteDelta(deltaTotal)}
            <small>{formatSignedPercentDelta(deltaPercent)}</small>
            <Meter.Root
              aria-valuetext={`Decoded JavaScript difference ${formatSignedPercentDelta(
                deltaPercent
              )}`}
              className={styles.meter}
              value={toSavingsMeterValue(deltaPercent)}
            >
              <Meter.Label className={styles.meterLabel}>
                Decoded JavaScript difference
              </Meter.Label>
              <Meter.Track className={styles.meterTrack}>
                <Meter.Indicator className={styles.meterIndicator} />
              </Meter.Track>
            </Meter.Root>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function RewriteTarget({ result }: { result: MeasurementResult | null }) {
  const generatedHandlerPath = result?.splitter.metadata.generatedHandlerPath;

  if (generatedHandlerPath == null) {
    return <strong>{getRewriteTargetLabel(result)}</strong>;
  }

  return <code>{generatedHandlerPath}</code>;
}

function RouteDetailsGrid({
  route,
  target,
  result
}: {
  route: DemoRoute;
  target: ComparisonDemoTarget;
  result: MeasurementResult | null;
}) {
  return (
    <div className={styles.detailsGrid}>
      <div>
        <span>Kind</span>
        <strong>{route.kind}</strong>
      </div>
      <div>
        <span>With splitter</span>
        <code>{toZoneUrl(target, route.path)}</code>
      </div>
      <div>
        <span>Without splitter</span>
        <code>{getBaselineRoutePath(result, route)}</code>
      </div>
      <div>
        <span>Rewrite target</span>
        <RewriteTarget result={result} />
      </div>
    </div>
  );
}

function DetailsError({ message }: { message: string | null }) {
  if (message == null) {
    return null;
  }

  return <p className={styles.error}>{message}</p>;
}

function TechnicalSummary({ result }: { result: MeasurementResult }) {
  return (
    <div className={styles.technicalSummary}>
      <span>Splitter HTTP {result.splitter.navigationStatus ?? '-'}</span>
      <span>Baseline HTTP {result.baseline.navigationStatus ?? '-'}</span>
      <span>Measured {formatDuration(result.durationMs)}</span>
      <span>
        Splitter JavaScript {getSplitterPayloadSummary(result.splitter.chunks)}
      </span>
    </div>
  );
}

function EmptyDetails() {
  return (
    <div className={styles.empty}>
      Measurement details appear here after the route has run.
    </div>
  );
}

function MeasuredRouteDetails({
  result,
  splitterChunks,
  baselineChunks
}: MeasuredRouteDetailsProps) {
  const baselineDecodedJsTotal = sumDecodedJsBytes(baselineChunks);
  const splitterDecodedJsTotal = sumDecodedJsBytes(splitterChunks);

  return (
    <>
      <TechnicalSummary result={result} />

      <DecodedJsSizeSummary
        baselineTotal={baselineDecodedJsTotal}
        splitterTotal={splitterDecodedJsTotal}
        deltaTotal={result.decodedJsByteSizeDelta}
      />

      <div className={styles.diagnosticsGrid}>
        <ChunkDiagnostics
          title='Baseline JavaScript payload'
          chunks={baselineChunks}
          emptyText='No baseline JavaScript payload was observed.'
        />
        <ChunkDiagnostics
          title='Splitter JavaScript payload'
          chunks={splitterChunks}
          emptyText='No splitter JavaScript payload was selected.'
        />
      </div>
    </>
  );
}

export function ExpandedRouteDetails({
  route,
  target,
  state
}: ExpandedRouteDetailsProps) {
  const { result } = state;
  const error = state.phase === 'failed' ? state.error.message : null;

  if (result == null) {
    return (
      <div className={styles.details}>
        <RouteDetailsGrid route={route} target={target} result={result} />
        <DetailsError message={error} />
        <EmptyDetails />
      </div>
    );
  }

  return (
    <div className={styles.details}>
      <RouteDetailsGrid route={route} target={target} result={result} />
      <DetailsError message={error} />
      <MeasuredRouteDetails
        result={result}
        splitterChunks={result.splitter.chunks}
        baselineChunks={result.baseline.chunks}
      />
    </div>
  );
}
