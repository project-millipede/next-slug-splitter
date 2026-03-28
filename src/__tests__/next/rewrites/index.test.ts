import { describe, expect, it } from 'vitest';

import { buildRouteRewriteEntries } from '../../../next/rewrites/index';
import { createHeavyRoute } from '../../helpers/builders';

import type { RouteHandlerRewrite } from '../../../next/types';

const heavyRoutes = [
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

describe('rewrite generation', () => {
  it('creates locale-aware page rewrites', () => {
    const rewrites: Array<RouteHandlerRewrite> = buildRouteRewriteEntries({
      heavyRoutes,
      defaultLocale: 'en',
      routeBasePath: '/content'
    });

    expect(rewrites).toContainEqual({
      source: '/content/nested/example',
      destination: '/content/_handlers/nested/example/en',
      locale: false
    });
    expect(rewrites).toContainEqual({
      source: '/en/content/nested/example',
      destination: '/en/content/_handlers/nested/example/en',
      locale: false
    });
    expect(rewrites).toContainEqual({
      source: '/de/content/nested/example',
      destination: '/de/content/_handlers/nested/example/de',
      locale: false
    });
    expect(
      rewrites.some(rewrite => rewrite.source.includes('/_next/data/'))
    ).toBe(false);
    expect(rewrites).toHaveLength(3);
  });
});
