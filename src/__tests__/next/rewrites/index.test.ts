import { describe, expect, test } from 'vitest';

import { createSingleLocaleConfig } from '../../../core/locale-config';
import { buildRouteRewriteEntries } from '../../../next/shared/rewrites/index';
import { createHeavyRoute } from '../../helpers/builders';
import { TEST_MULTI_LOCALE_CONFIG } from '../../helpers/fixtures';

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
  };

  const scenarios: Scenario[] = [
    {
      id: 'Multi-Locale',
      description:
        'keeps locale-prefixed sources with locale-less handler destinations',
      heavyRoutes: multiLocaleHeavyRoutes,
      localeConfig: TEST_MULTI_LOCALE_CONFIG,
      expectedRewrites: [
        {
          source: '/content/nested/example',
          destination: '/content/generated-handlers/nested/example/en',
          locale: false
        },
        {
          source: '/en/content/nested/example',
          destination: '/content/generated-handlers/nested/example/en',
          locale: false
        },
        {
          source: '/de/content/nested/example',
          destination: '/content/generated-handlers/nested/example/de',
          locale: false
        }
      ]
    },
    {
      id: 'Single-Locale',
      description: 'keeps only canonical rewrites in single-locale apps',
      heavyRoutes: singleLocaleHeavyRoutes,
      localeConfig: singleLocaleConfig,
      expectedRewrites: [
        {
          source: '/content/dashboard',
          destination: '/content/generated-handlers/dashboard',
          locale: false
        },
        {
          source: '/content/interactive',
          destination: '/content/generated-handlers/interactive',
          locale: false
        }
      ]
    }
  ];

  test.for(scenarios)(
    '[$id] $description',
    ({ heavyRoutes, localeConfig, expectedRewrites }) => {
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
      expect(rewrites).toHaveLength(expectedRewrites.length);
    }
  );

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

  test('keeps locale prefixes on public sources, not handler destination prefixes', () => {
    const rewrites: Array<RouteHandlerRewrite> = buildRouteRewriteEntries({
      heavyRoutes: multiLocaleHeavyRoutes,
      localeConfig: TEST_MULTI_LOCALE_CONFIG,
      routeBasePath: '/content'
    });

    /**
     * Locale prefix invariant:
     * 1. Exact rewrite objects are asserted by the scenario table above.
     * 2. This test isolates the source/destination prefix rule.
     * 3. Public source URLs may carry `/en/content/` or `/de/content/`.
     * 4. Generated-handler destinations must not carry those public prefixes.
     */
    const localePrefixes = ['/en/content/', '/de/content/'];
    const hasAnyPrefix = (value: string, prefixes: Array<string>): boolean =>
      prefixes.some(prefix => value.startsWith(prefix));

    const localePrefixedSourceRewrites = rewrites.filter(rewrite =>
      hasAnyPrefix(rewrite.source, localePrefixes)
    );

    expect(localePrefixedSourceRewrites).not.toHaveLength(0);
    expect(
      localePrefixedSourceRewrites.every(
        rewrite => !hasAnyPrefix(rewrite.destination, localePrefixes)
      )
    ).toBe(true);
  });

  test('builds slash-safe generated-handler destinations for root targets', () => {
    const rewrites: Array<RouteHandlerRewrite> = buildRouteRewriteEntries({
      heavyRoutes: [
        createHeavyRoute({
          locale: 'en',
          slugArray: ['dashboard'],
          handlerId: 'en-dashboard',
          handlerRelativePath: 'dashboard/en',
          usedLoadableComponentKeys: ['DashboardComponent']
        })
      ],
      localeConfig: TEST_MULTI_LOCALE_CONFIG,
      routeBasePath: '/'
    });

    expect(rewrites).toContainEqual({
      source: '/dashboard',
      destination: '/generated-handlers/dashboard/en',
      locale: false
    });
    expect(rewrites.some(rewrite => rewrite.destination.includes('//'))).toBe(
      false
    );
  });
});
