import type { BaselineDemoTarget } from '../../../../lib/benchmark/catalog';
import type { SplitterRouteMetadata } from './manifest';

export type MeasuredJsChunk = {
  /**
   * Same-origin facade JavaScript chunk URL observed during the iframe load.
   */
  path: string;
  /**
   * Diagnostic HTTP status reported by the browser Resource Timing entry, or
   * null when that browser does not expose it. This field validates known
   * failures but is never used in measurement calculations.
   */
  responseStatus: number | null;
  /**
   * Decoded JavaScript bytes reported by Resource Timing.
   */
  decodedJsByteSize: number;
  /**
   * Encoded JavaScript bytes reported by Resource Timing.
   */
  encodedJsByteSize: number;
  /**
   * Browser Resource Timing duration for this actual JavaScript chunk load.
   */
  loadDurationMs: number;
};

/**
 * Browser evidence collected while loading one target route.
 *
 * This intermediate model intentionally excludes manifest-derived metadata.
 * The route orchestrator combines both sources into `RouteLoadMeasurement`.
 */
export type JsChunkLoadMeasurement = {
  /** JavaScript resource measurements produced by the iframe route load. */
  chunks: MeasuredJsChunk[];
  /** Browser-reported document response status, or null when unavailable. */
  navigationStatus: number | null;
};

export type RouteLoadMeasurement = {
  /**
   * Manifest-derived metadata for this measured route load.
   */
  metadata: SplitterRouteMetadata;
  /**
   * Iframe navigation status for this measured route load.
   */
  navigationStatus: number | null;
  /**
   * Exact build-selected JavaScript payload observed during the browser route
   * load. The array is empty for an intentional light-route zero and otherwise
   * contains exactly one resource.
   */
  chunks: MeasuredJsChunk[];
};

export type MeasurementResult = {
  /**
   * Splitter route load for the selected comparison target.
   */
  splitter: RouteLoadMeasurement;
  /**
   * Heavy baseline route load paired with the selected comparison target.
   */
  baseline: RouteLoadMeasurement;
  /**
   * Internal heavy baseline target paired with the selected comparison target.
   */
  baselineTarget: BaselineDemoTarget;
  /**
   * End-to-end wall time for this comparison run.
   */
  durationMs: number;
  /**
   * Exact decoded JavaScript difference calculated as `baseline - splitter`.
   * Positive values are improvements; negative values are regressions.
   */
  decodedJsByteSizeDelta: number;
  /**
   * Exact encoded JavaScript difference calculated as `baseline - splitter`.
   * Positive values are improvements; negative values are regressions.
   */
  encodedJsByteSizeDelta: number;
};
