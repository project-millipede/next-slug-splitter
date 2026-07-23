import type { MeasuredJsChunk } from './types';

/**
 * Sum one Resource Timing byte field across observed chunks.
 *
 * @param chunks - Measured chunks to aggregate.
 * @param field - Numeric chunk field to sum.
 * @returns Total value, including zero for an empty chunk list.
 */
const sumJsByteField = (
  chunks: MeasuredJsChunk[],
  field: 'decodedJsByteSize' | 'encodedJsByteSize'
): number => chunks.reduce((total, chunk) => total + chunk[field], 0);

/**
 * Sum decoded JavaScript bytes for measured chunks.
 *
 * @param chunks - Measured chunks to aggregate.
 * @returns Decoded JavaScript byte total.
 */
export const sumDecodedJsBytes = (chunks: MeasuredJsChunk[]): number =>
  sumJsByteField(chunks, 'decodedJsByteSize');

/**
 * Sum encoded JavaScript bytes for measured chunks.
 *
 * @param chunks - Measured chunks to aggregate.
 * @returns Encoded JavaScript byte total.
 */
export const sumEncodedJsBytes = (chunks: MeasuredJsChunk[]): number =>
  sumJsByteField(chunks, 'encodedJsByteSize');

/**
 * Sum browser resource durations for measured chunks.
 *
 * @param chunks - Measured chunks to aggregate.
 * @returns Duration total, including zero for an empty chunk list.
 */
export const sumChunkLoadDurations = (chunks: MeasuredJsChunk[]): number =>
  chunks.reduce((total, chunk) => total + chunk.loadDurationMs, 0);

/**
 * Calculate the signed byte difference between baseline and splitter.
 *
 * The result deliberately preserves regressions:
 *
 * 1. A positive value means the splitter transferred fewer bytes.
 * 2. Zero means both variants transferred the same number of bytes.
 * 3. A negative value means the splitter transferred more bytes.
 *
 * @param baselineTotal - Heavy-baseline byte total.
 * @param splitterTotal - Splitter byte total.
 * @returns Exact `baselineTotal - splitterTotal` byte difference.
 */
export const calculateByteSizeDelta = (
  baselineTotal: number,
  splitterTotal: number
): number => baselineTotal - splitterTotal;

/**
 * Calculate the signed chunk-load duration delta between baseline and splitter.
 *
 * Positive values mean the splitter resources completed faster, while negative
 * values mean they completed slower for that route load.
 *
 * @param baselineLoadDuration - Total baseline chunk-load duration.
 * @param splitterLoadDuration - Total splitter chunk-load duration.
 * @returns Exact `baselineLoadDuration - splitterLoadDuration` difference.
 */
export const calculateLoadDurationDelta = (
  baselineLoadDuration: number,
  splitterLoadDuration: number
): number => baselineLoadDuration - splitterLoadDuration;

/**
 * Calculate the signed baseline-relative percentage represented by a delta.
 *
 * The percentage preserves the underlying measurement instead of applying
 * presentation bounds:
 *
 * 1. A positive value means the splitter is smaller or faster.
 * 2. Zero means both variants are equal.
 * 3. A negative value means the splitter is larger or slower.
 * 4. A regression may exceed `-100%` when the splitter value is more than
 *    twice the baseline value.
 *
 * @param baselineTotal - Positive baseline value used as the denominator.
 * @param deltaTotal - Exact `baseline - splitter` difference.
 * @returns Signed, unclamped percentage, or null for a non-positive baseline.
 */
export const calculateDeltaPercent = (
  baselineTotal: number,
  deltaTotal: number
): number | null => {
  if (baselineTotal <= 0) {
    return null;
  }

  return (deltaTotal / baselineTotal) * 100;
};
