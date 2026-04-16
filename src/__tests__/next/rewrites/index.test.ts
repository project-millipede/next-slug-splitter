import { describe, expect, test } from 'vitest';

import { createSingleLocaleConfig } from '../../../core/locale-config';
import { buildRouteRewriteEntries } from '../../../next/shared/rewrites/index';
import { createHeavyRoute } from '../../helpers/builders';

import type { LocaleConfig } from '../../../core/types';
import type { RouteHandlerRewrite } from '../../../next/shared/types';

describe('rewrite generation', () => {
  const singleLocaleConfig = createSingleLocaleConfig();
  const multiLocaleHeavyRoutes = [
    createHeavyRoute({
      locale: 'en',
      slugArray: ['nested', 'example'],
      handlerId: 'en-nested-example',
      handlerRelativePath: 'nested/example/en',
      usedLoadableComponentKeys: ['CustomComponent']
    }),
    createHeavyRoute({
      locale: 'de',
      slugArray: ['nested', 'example'],
      handlerId: 'de-nested-example',
      handlerRelativePath: 'nested/example/de',
      usedLoadableComponentKeys: ['CustomComponent']
    })
  ];
  const singleLocaleHeavyRoutes = [
    createHeavyRoute({
      locale: singleLocaleConfig.defaultLocale,
      slugArray: ['interactive'],
      handlerId: 'en-interactive',
      handlerRelativePath: 'interactive',
      usedLoadableComponentKeys: ['InteractiveComponent']
    }),
    createHeavyRoute({
      locale: singleLocaleConfig.defaultLocale,
      slugArray: ['dashboard'],
      handlerId: 'en-dashboard',
      handlerRelativePath: 'dashboard',
      usedLoadableComponentKeys: ['DashboardComponent']
    })
  ];

  type Scenario = {
    id: string;
    description: string;
    heavyRoutes: Array<(typeof multiLocaleHeavyRoutes)[number]>;
    localeConfig: LocaleConfig;
    expectedRewrites: Array<RouteHandlerRewrite>;
    expectedLength: number;
  };

  const scenarios: Scenario[] = [
    {
      id: 'Multi-Locale',
      description: 'keeps the locale-aware default-locale alias in multi-locale apps',
      heavyRoutes: multiLocaleHeavyRoutes,
      localeConfig: {
        locales: ['en', 'de'],
        defaultLocale: 'en'
      },
      expectedRewrites: [
        {
          source: '/content/nested/example',
          destination: '/content/_handlers/nested/example/en',
          locale: false
        },
        {
          source: '/en/content/nested/example',
          destination: '/en/content/_handlers/nested/example/en',
          locale: false
        },
        {
          source: '/de/content/nested/example',
          destination: '/de/content/_handlers/nested/example/de',
          locale: false
        }
      ],
      expectedLength: 3
    },
    {
      id: 'Single-Locale',
      description: 'keeps only canonical rewrites in single-locale apps',
      heavyRoutes: singleLocaleHeavyRoutes,
      localeConfig: singleLocaleConfig,
      expectedRewrites: [
        {
          source: '/content/dashboard',
          destination: '/content/_handlers/dashboard',
          locale: false
        },
        {
          source: '/content/interactive',
          destination: '/content/_handlers/interactive',
          locale: false
        }
      ],
      expectedLength: 2
    }
  ];

  test.for(scenarios)('[$id] $description', ({
    heavyRoutes,
    localeConfig,
    expectedRewrites,
    expectedLength
  }) => {
    const rewrites: Array<RouteHandlerRewrite> = buildRouteRewriteEntries({
      heavyRoutes,
      localeConfig,
      routeBasePath: '/content'
    });

    expectedRewrites.forEach(expectedRewrite => {
      expect(rewrites).toContainEqual(expectedRewrite);
    });
    expect(
      rewrites.some(rewrite => rewrite.source.includes('/_next/data/'))
    ).toBe(false);
    expect(rewrites).toHaveLength(expectedLength);
  });

  test('supports an alternate internal handler route segment', () => {
    const rewrites: Array<RouteHandlerRewrite> = buildRouteRewriteEntries({
      heavyRoutes: singleLocaleHeavyRoutes,
      localeConfig: singleLocaleConfig,
      routeBasePath: '/content',
      handlerRouteSegment: 'generated-handlers'
    });

    expect(rewrites).toContainEqual({
      source: '/content/dashboard',
      destination: '/content/generated-handlers/dashboard',
      locale: false
    });
    expect(
      rewrites.some(rewrite => rewrite.source.startsWith('/en/content/'))
    ).toBe(false);
  });
});
