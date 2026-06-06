import { describe, expect, test } from 'vitest';

import { buildAppDefaultLocaleNormalizationRewrites } from '../../../../next/app/rewrites/default-locale-normalization';
import { TEST_MULTI_LOCALE_CONFIG } from '../../../helpers/fixtures';

describe('App default-locale normalization rewrites', () => {
  test('builds App default-locale normalization rewrites without analyzer input', () => {
    expect(
      buildAppDefaultLocaleNormalizationRewrites(
        TEST_MULTI_LOCALE_CONFIG,
        '/content'
      )
    ).toEqual([
      {
        source: '/content',
        destination: '/en/content',
        locale: false
      },
      {
        source: '/content/:path*',
        destination: '/en/content/:path*',
        locale: false
      }
    ]);
  });

  test('does not emit App default-locale normalization rewrites for root targets', () => {
    expect(
      buildAppDefaultLocaleNormalizationRewrites(TEST_MULTI_LOCALE_CONFIG, '/')
    ).toEqual([]);
  });
});
