import { describe, expect, test } from 'vitest';

import {
  hasLocalePrefix,
  removeLocalePrefix,
  toSourcePathSegments
} from '../../next/shared/public-pathname';

const localeConfig = {
  locales: ['en', 'de'],
  defaultLocale: 'en'
};

describe('public pathname helpers', () => {
  test('splits source pathnames into non-empty segments', () => {
    expect(toSourcePathSegments('/de/a/')).toEqual(['de', 'a']);
    expect(toSourcePathSegments('/')).toEqual([]);
  });

  test('detects only leading locale prefixes', () => {
    expect(hasLocalePrefix('/de/a', localeConfig)).toBe(true);
    expect(hasLocalePrefix('/a/de', localeConfig)).toBe(false);
    expect(hasLocalePrefix('/', localeConfig)).toBe(false);
  });

  test('removes only leading locale prefixes from source path segments', () => {
    expect(removeLocalePrefix(['de', 'a'], localeConfig)).toEqual(['a']);
    expect(removeLocalePrefix(['a', 'de'], localeConfig)).toEqual(['a', 'de']);
    expect(removeLocalePrefix([], localeConfig)).toEqual([]);
  });
});
