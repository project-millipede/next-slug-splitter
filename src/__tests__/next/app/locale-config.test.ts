import { describe, expect, it } from 'vitest';

import { createSingleLocaleConfig } from '../../../core/locale-config';
import { resolveAppLocaleConfig } from '../../../next/app/config/locale';
import {
  TEST_MULTI_LOCALE_CONFIG,
  TEST_SINGLE_LOCALE_CONFIG
} from '../../helpers/fixtures';

describe('App Router locale normalization', () => {
  it('treats omitted app.localeConfig as single-locale mode', () => {
    expect(
      resolveAppLocaleConfig({
        routerKind: 'app',
        app: {
          rootDir: '/repo/app'
        }
      })
    ).toEqual(createSingleLocaleConfig());
  });

  it('accepts explicit multi-locale App config', () => {
    expect(
      resolveAppLocaleConfig({
        routerKind: 'app',
        app: {
          rootDir: '/repo/app',
          localeConfig: TEST_MULTI_LOCALE_CONFIG
        }
      })
    ).toEqual(TEST_MULTI_LOCALE_CONFIG);
  });

  it('rejects explicit single-locale App config', () => {
    expect(() =>
      resolveAppLocaleConfig({
        routerKind: 'app',
        app: {
          rootDir: '/repo/app',
          localeConfig: TEST_SINGLE_LOCALE_CONFIG
        }
      })
    ).toThrow(
      'Single-locale App Router setups must omit routeHandlersConfig.app.localeConfig.'
    );
  });
});
