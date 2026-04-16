import { describe, expect, it } from 'vitest';

import { createSingleLocaleConfig } from '../../../core/locale-config';
import { resolveAppLocaleConfig } from '../../../next/app/config/locale';

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
          localeConfig: {
            locales: ['en', 'de'],
            defaultLocale: 'en'
          }
        }
      })
    ).toEqual({
      locales: ['en', 'de'],
      defaultLocale: 'en'
    });
  });

  it('rejects explicit single-locale App config', () => {
    expect(() =>
      resolveAppLocaleConfig({
        routerKind: 'app',
        app: {
          rootDir: '/repo/app',
          localeConfig: {
            locales: ['en'],
            defaultLocale: 'en'
          }
        }
      })
    ).toThrow(
      'Single-locale App Router setups must omit routeHandlersConfig.app.localeConfig.'
    );
  });
});
