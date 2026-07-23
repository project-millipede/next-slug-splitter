import type { DemoRoute } from '../../../lib/benchmark/catalog';

/**
 * Format a byte count with the fixed units used by the measurement UI.
 *
 * @param value - Byte count to format, or null when unavailable.
 * @returns Human-readable byte label.
 */
export const formatBytes = (value: number | null): string => {
  if (value == null) {
    return '-';
  }

  if (value === 0) {
    return '0 B';
  }

  const units = ['B', 'kB', 'MB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 2);
  const amount = value / 1024 ** index;
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

/**
 * Format a duration in whole milliseconds.
 *
 * @param value - Duration in milliseconds, or null when unavailable.
 * @returns Human-readable duration label.
 */
export const formatDuration = (value: number | null): string =>
  value == null ? '-' : `${Math.round(value)} ms`;

/**
 * Format a percentage as a whole-number percent label.
 *
 * @param value - Percent value, or null when unavailable.
 * @returns Human-readable percent label.
 */
export const formatPercent = (value: number | null): string =>
  value == null ? '-' : `${Math.round(value)}%`;

/**
 * Select the visible sign for a baseline-relative difference.
 *
 * Internal differences use `baseline - splitter`: positive values mean the
 * splitter is smaller or faster. The visible sign describes the splitter
 * relative to the baseline, so improvements render with `-` and regressions
 * render with `+`.
 *
 * @param value - Raw delta value before display formatting.
 * @returns Display prefix for a signed improvement/regression difference.
 */
const getSignedDeltaPrefix = (value: number): string => {
  if (value > 0) {
    return '-';
  }

  if (value < 0) {
    return '+';
  }

  return '';
};

/**
 * Format a baseline-relative byte difference.
 *
 * Positive internal values mean the splitter transferred fewer bytes and
 * render with `-`; negative values mean it transferred more and render with
 * `+`.
 *
 * @param value - Exact `baseline - splitter` byte difference.
 * @returns Human-readable signed byte delta.
 */
export const formatSignedByteDelta = (value: number): string => {
  const prefix = getSignedDeltaPrefix(value);
  return `${prefix}${formatBytes(Math.abs(value))}`;
};

/**
 * Format a baseline-relative duration difference.
 *
 * Positive internal values mean the splitter loaded faster and render with
 * `-`; negative values mean it loaded slower and render with `+`.
 *
 * @param value - Exact `baseline - splitter` duration difference.
 * @returns Human-readable signed duration delta.
 */
export const formatSignedDurationDelta = (value: number): string => {
  const prefix = getSignedDeltaPrefix(value);
  return `${prefix}${formatDuration(Math.abs(value))}`;
};

/**
 * Format a signed baseline-relative percentage difference.
 *
 * @param value - Signed percentage using `baseline - splitter` semantics, or
 * null when the baseline denominator is unavailable.
 * @returns Human-readable signed percent delta.
 */
export const formatSignedPercentDelta = (value: number | null): string => {
  if (value == null) {
    return '-';
  }

  const prefix = getSignedDeltaPrefix(value);
  return `${prefix}${formatPercent(Math.abs(value))}`;
};

/**
 * Project a signed difference percentage onto a savings-oriented meter.
 *
 * This is intentionally a presentation-only constraint:
 *
 * 1. Regressions and equality render with an empty savings meter.
 * 2. Improvements render proportionally between zero and one hundred.
 * 3. Improvements above one hundred are capped only because a meter cannot
 *    render beyond its track.
 *
 * The underlying difference and its displayed label remain signed and
 * unclamped.
 *
 * @param deltaPercent - Signed baseline-relative difference percentage.
 * @returns Meter value constrained to the inclusive 0-100 range.
 */
export const toSavingsMeterValue = (deltaPercent: number | null): number => {
  if (deltaPercent == null || deltaPercent <= 0) {
    return 0;
  }

  return Math.min(100, deltaPercent);
};

/**
 * Extract the filename-like label from a chunk path.
 *
 * @param chunkPath - Same-origin facade chunk path.
 * @returns Last path segment, or the original path when no segment exists.
 */
export const getChunkLabel = (chunkPath: string): string => {
  const pathSegments = chunkPath.split('/');
  const filename = pathSegments.pop();

  return filename || chunkPath;
};

/**
 * Resolve the label shown for a route row.
 *
 * @param route - Benchmark demo route.
 * @returns Human-readable route label.
 */
export const getRouteDisplayName = (route: DemoRoute): string => route.label;
