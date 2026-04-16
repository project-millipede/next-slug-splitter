import { describe, expect, it } from 'vitest';

import { createSingleLocaleConfig } from '../../../core/locale-config';
import { resolvePagesLocaleConfig } from '../../../next/pages/config/locale';

describe('Pages Router locale normalization', () => {
  it('treats missing Next i18n config as single-locale mode', () => {
    expect(resolvePagesLocaleConfig({})).toEqual(createSingleLocaleConfig());
  });

  it('accepts explicit multi-locale Next i18n config', () => {
    expect(
      resolvePagesLocaleConfig({
        i18n: {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        }
      })
    ).toEqual({
      locales: ['en', 'de'],
      defaultLocale: 'en'
    });
  });

  it('rejects explicit single-locale Next i18n config', () => {
    expect(() =>
      resolvePagesLocaleConfig({
        i18n: {
          locales: ['en'],
          defaultLocale: 'en'
        }
      })
    ).toThrow(
      'Single-locale Pages Router setups must omit Next i18n config.'
    );
  });
});
