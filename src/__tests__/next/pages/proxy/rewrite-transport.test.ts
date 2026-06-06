import { describe, expect, test } from 'vitest';

import { preservePagesRouterLocaleInProxyRewriteDestination } from '../../../../next/pages/proxy/rewrite-transport';
import {
  TEST_MULTI_LOCALE_CONFIG,
  TEST_SINGLE_LOCALE_CONFIG
} from '../../../helpers/fixtures';

describe('preservePagesRouterLocaleInProxyRewriteDestination', () => {
  test.for([
    {
      id: 'non-default-locale',
      description:
        'adds the resolved non-default locale to a locale-less generated-handler destination',
      rewriteDestination: '/docs/generated-handlers/a/de',
      locale: 'de',
      expectedDestination: '/de/docs/generated-handlers/a/de'
    },
    {
      id: 'explicit-default-locale',
      description:
        'adds the resolved default locale for explicit default-locale Pages requests',
      rewriteDestination: '/docs/generated-handlers/a/en',
      locale: 'en',
      expectedDestination: '/en/docs/generated-handlers/a/en'
    },
    {
      id: 'already-prefixed',
      description: 'keeps already locale-prefixed destinations unchanged',
      rewriteDestination: '/de/docs/generated-handlers/a/de',
      locale: 'de',
      expectedDestination: '/de/docs/generated-handlers/a/de'
    },
    {
      id: 'unknown-locale',
      description:
        'keeps destinations unchanged when the locale is not configured',
      rewriteDestination: '/docs/generated-handlers/a/fr',
      locale: 'fr',
      expectedDestination: '/docs/generated-handlers/a/fr'
    }
  ])(
    '[$id] $description',
    ({ rewriteDestination, locale, expectedDestination }) => {
      expect(
        preservePagesRouterLocaleInProxyRewriteDestination(
          rewriteDestination,
          locale,
          TEST_MULTI_LOCALE_CONFIG
        )
      ).toBe(expectedDestination);
    }
  );

  test('keeps single-locale destinations unchanged', () => {
    expect(
      preservePagesRouterLocaleInProxyRewriteDestination(
        '/docs/generated-handlers/a/en',
        'en',
        TEST_SINGLE_LOCALE_CONFIG
      )
    ).toBe('/docs/generated-handlers/a/en');
  });
});
