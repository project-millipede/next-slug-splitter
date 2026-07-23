import {
  findBaselineDemoTarget,
  type BaselineDemoTarget,
  type ComparisonDemoTarget,
  type DemoRoute,
  type DemoTarget
} from '../../../lib/benchmark/catalog';

import { createRunId } from './cache-busting';
import {
  calculateByteSizeDelta,
  sumDecodedJsBytes,
  sumEncodedJsBytes
} from './chunks';
import type {
  ManifestKind,
  MeasurementResult,
  RouteLoadMeasurement
} from './types';
import {
  fetchRoutePayloadManifest,
  resolveRoutePayload
} from './payload-manifest';
import { measurePayloadChunk } from './measure-payload-chunk';

/**
 * Maximum wall time for the awaited work of one target measurement.
 *
 * The budget starts before the manifest request and remains active until
 * iframe navigation and evidence validation finish. It is exclusively a
 * failure deadline and is never used as the measured load duration.
 */
const TARGET_MEASUREMENT_BUDGET_MS = 5000;

type BaselineRouteLoadResult = {
  target: BaselineDemoTarget;
  load: RouteLoadMeasurement;
};

/**
 * Measure the exact build-selected payload for one target route.
 *
 * Sequence:
 *
 * 1. Start one five-second target budget.
 * 2. Fetch the static route payload manifest with its shared signal.
 * 3. Resolve an explicitly selected payload or intentional splitter zero.
 * 4. Load the route once in an iframe with the same signal.
 * 5. At iframe load, validate the navigation and read buffered Resource Timing
 *    once when a payload is expected.
 * 6. Require the exact initial external JavaScript resource and validate its
 *    byte sizes and duration.
 * 7. Reject any browser-exposed response status outside the 2xx range.
 * 8. Return the complete target route-load measurement.
 *
 * Response status is not a measurement input. An unavailable status removes
 * only the browser's independent 2xx confirmation; exact payload identity,
 * encoded and decoded byte sizes, and load duration remain required.
 *
 * Complete target flow:
 *
 * ```text
 * Start five-second target budget
 *           │
 *           ▼
 * Fetch static manifest ─────────────────────────┐
 *           │                                    │
 * Resolve exact payload                          │
 *           │                                    │ Shared AbortSignal
 * Load hidden iframe                             │
 *           │                                    │
 *           ├─ load ─────────────────────────────┘
 *           │    ├─ validate navigation
 *           │    ├─ read buffered Resource Timing once
 *           │    ├─ require the selected initial resource when expected
 *           │    ├─ validate byte sizes and duration
 *           │    └─ reject any browser-exposed non-2xx status
 *           │
 *           └─ target budget expires
 *                ├─ abort the active manifest request, or
 *                ├─ remove the pending iframe
 *                └─ report a hard measurement failure
 * ```
 *
 * @param target Splitter or heavy-baseline target being measured.
 * @param route Public demo route being measured.
 * @param kind Splitter or heavy-baseline manifest kind owned by the target.
 * @param runId Unique cache-busting identifier for this target load.
 * @returns Route load containing zero or one measured JavaScript payloads.
 * @throws When the budget expires, required measurement evidence is
 * unavailable, or the browser reports a known unsuccessful response.
 */
const measureTargetRouteLoad = async (
  target: DemoTarget,
  route: DemoRoute,
  kind: ManifestKind,
  runId: string
): Promise<RouteLoadMeasurement> => {
  const abortController = new AbortController();
  const timeoutId = window.setTimeout(() => {
    abortController.abort();
  }, TARGET_MEASUREMENT_BUDGET_MS);

  try {
    const manifest = await fetchRoutePayloadManifest(
      target,
      kind,
      runId,
      abortController.signal
    );
    const resolvedRoute = resolveRoutePayload(
      manifest,
      route,
      target,
      kind
    );
    const measurement = await measurePayloadChunk(
      target,
      route,
      resolvedRoute.payloadChunk,
      runId,
      abortController.signal
    );

    return {
      metadata: resolvedRoute.metadata,
      navigationStatus: measurement.navigationStatus,
      chunks: measurement.chunks
    };
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error(
        `Measurement of "${route.path}" in ${target.label} timed out after ${TARGET_MEASUREMENT_BUDGET_MS} ms.`
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

/**
 * Resolve and measure the required heavy baseline for one comparison target.
 *
 * @param target User-facing comparison target.
 * @param route Public demo route being measured.
 * @param runId Unique cache-busting identifier for the baseline load.
 * @returns Required baseline target and its route load measurement.
 * @throws When benchmark configuration omits the referenced baseline target.
 */
const measureBaselineRouteLoad = async (
  target: ComparisonDemoTarget,
  route: DemoRoute,
  runId: string
): Promise<BaselineRouteLoadResult> => {
  const baselineTarget = findBaselineDemoTarget(target.baselineTargetId);

  if (baselineTarget === null) {
    throw new Error(
      `Missing baseline target "${target.baselineTargetId}" for ${target.label}.`
    );
  }

  const load = await measureTargetRouteLoad(
    baselineTarget,
    route,
    'heavy-baseline',
    runId
  );

  return {
    target: baselineTarget,
    load
  };
};

/**
 * Calculate signed JavaScript byte differences for the selected payloads.
 *
 * The manifest has already selected one payload at build time, so this
 * calculation sums the zero-or-one measured payloads directly without applying
 * any runtime size classifier.
 *
 * @param splitterLoad Splitter route load measurement.
 * @param baselineLoad Heavy-baseline route load measurement.
 * @returns Exact decoded and encoded `baseline - splitter` differences.
 */
const calculateRouteJsByteSizeDeltas = (
  splitterLoad: RouteLoadMeasurement,
  baselineLoad: RouteLoadMeasurement
): {
  decodedJsByteSizeDelta: number;
  encodedJsByteSizeDelta: number;
} => ({
  decodedJsByteSizeDelta: calculateByteSizeDelta(
    sumDecodedJsBytes(baselineLoad.chunks),
    sumDecodedJsBytes(splitterLoad.chunks)
  ),
  encodedJsByteSizeDelta: calculateByteSizeDelta(
    sumEncodedJsBytes(baselineLoad.chunks),
    sumEncodedJsBytes(splitterLoad.chunks)
  )
});

/**
 * Measure one route using its exact build-selected JavaScript payload.
 *
 * Sequence:
 *
 * 1. Create one comparison run identifier.
 * 2. Measure the splitter route and its selected payload.
 * 3. Measure the required heavy baseline after the splitter has completed.
 * 4. Compare the exact zero-or-one payload totals.
 * 5. Return the complete result consumed by the benchmark interface.
 *
 * Splitter and baseline loads remain sequential. Their hidden iframes must not
 * compete for browser, network, or server resources during one comparison.
 *
 * @param route Public demo route represented by the benchmark row.
 * @param target User-facing comparison target that owns the route.
 * @returns Complete measurement result consumed by the benchmark interface.
 * @throws When build-time selection or browser evidence is incomplete.
 */
export const measureRoute = async (
  route: DemoRoute,
  target: ComparisonDemoTarget
): Promise<MeasurementResult> => {
  const runId = createRunId();
  const startTime = performance.now();
  const splitter = await measureTargetRouteLoad(
    target,
    route,
    'splitter',
    `${runId}-splitter`
  );
  const baseline = await measureBaselineRouteLoad(
    target,
    route,
    `${runId}-baseline`
  );
  const byteSizeDeltas = calculateRouteJsByteSizeDeltas(
    splitter,
    baseline.load
  );

  return {
    splitter,
    baseline: baseline.load,
    baselineTarget: baseline.target,
    durationMs: performance.now() - startTime,
    decodedJsByteSizeDelta: byteSizeDeltas.decodedJsByteSizeDelta,
    encodedJsByteSizeDelta: byteSizeDeltas.encodedJsByteSizeDelta
  };
};
