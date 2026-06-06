import { describe, expect, test } from 'vitest';

import { buildRouteHandlerGuards } from '../../../next/shared/rewrites/guards';
import { TEST_MULTI_LOCALE_CONFIG } from '../../helpers/fixtures';

describe('route-handler rewrite guards', () => {
  test('builds public generated-handler guards for non-root targets', () => {
    const guards = buildRouteHandlerGuards({
      localeConfig: TEST_MULTI_LOCALE_CONFIG,
      routeBasePath: '/content',
      handlerRouteSegment: 'generated-handlers'
    });

    expect(guards).toEqual([
      {
        source: '/content/generated-handlers/:path*',
        destination: '/404',
        locale: false
      },
      {
        source: '/:locale(en|de)/content/generated-handlers/:path*',
        destination: '/404',
        locale: false
      }
    ]);
  });

  test('builds slash-safe public generated-handler guards for root targets', () => {
    const guards = buildRouteHandlerGuards({
      localeConfig: TEST_MULTI_LOCALE_CONFIG,
      routeBasePath: '/',
      handlerRouteSegment: 'generated-handlers'
    });

    expect(guards).toEqual([
      {
        source: '/generated-handlers/:path*',
        destination: '/404',
        locale: false
      },
      {
        source: '/:locale(en|de)/generated-handlers/:path*',
        destination: '/404',
        locale: false
      }
    ]);
    expect(guards.some(guard => guard.source.includes('//'))).toBe(false);
  });

  test('uses configured locales and handler route segment in guard matchers', () => {
    const guards = buildRouteHandlerGuards({
      localeConfig: {
        locales: ['en-US', 'pt.BR'],
        defaultLocale: 'en-US'
      },
      routeBasePath: '/articles',
      handlerRouteSegment: 'split-output'
    });

    expect(guards).toEqual([
      {
        source: '/articles/split-output/:path*',
        destination: '/404',
        locale: false
      },
      {
        source: '/:locale(en-US|pt\\.BR)/articles/split-output/:path*',
        destination: '/404',
        locale: false
      }
    ]);
  });
});
