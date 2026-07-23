import { describe, expect, test } from 'vitest';

import {
  calculateByteSizeDelta,
  calculateDeltaPercent
} from './chunks';
import {
  formatSignedByteDelta,
  formatSignedPercentDelta,
  toSavingsMeterValue
} from './format';

describe('baseline-relative measurement differences', () => {
  test('preserves improvements, equality, and regressions', () => {
    expect(calculateByteSizeDelta(100, 75)).toBe(25);
    expect(calculateByteSizeDelta(100, 100)).toBe(0);
    expect(calculateByteSizeDelta(75, 100)).toBe(-25);
  });

  test('keeps signed percentages unbounded', () => {
    expect(calculateDeltaPercent(100, 25)).toBe(25);
    expect(calculateDeltaPercent(100, 0)).toBe(0);
    expect(calculateDeltaPercent(100, -25)).toBe(-25);
    expect(calculateDeltaPercent(100, -250)).toBe(-250);
    expect(calculateDeltaPercent(0, 25)).toBeNull();
  });

  test('formats the splitter difference relative to the baseline', () => {
    expect(formatSignedByteDelta(25)).toBe('-25 B');
    expect(formatSignedByteDelta(0)).toBe('0 B');
    expect(formatSignedByteDelta(-25)).toBe('+25 B');
    expect(formatSignedPercentDelta(25)).toBe('-25%');
    expect(formatSignedPercentDelta(0)).toBe('0%');
    expect(formatSignedPercentDelta(-25)).toBe('+25%');
    expect(formatSignedPercentDelta(-250)).toBe('+250%');
  });

  test('constrains only the visual savings meter', () => {
    expect(toSavingsMeterValue(25)).toBe(25);
    expect(toSavingsMeterValue(-250)).toBe(0);
    expect(toSavingsMeterValue(250)).toBe(100);
    expect(toSavingsMeterValue(null)).toBe(0);
  });
});
