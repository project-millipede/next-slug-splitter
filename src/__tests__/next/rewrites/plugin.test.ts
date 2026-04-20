import { describe, expect, it } from 'vitest';

import { withRouteHandlerRewrites } from '../../../next/shared/rewrites/plugin';

import type {
  RouteHandlerRewrite,
  RouteHandlerRewritePhases
} from '../../../next/shared/types';

describe('rewrite plugin', () => {
  it('prepends nested route-handler rewrites into beforeFiles preserving existing rewrites', async () => {
    const routeRewrites: Array<RouteHandlerRewrite> = [
      {
        source: '/content/example',
        destination: '/content/generated-handlers/example/en',
        locale: false
      }
    ];
    const existingRewritePhases: RouteHandlerRewritePhases = {
      beforeFiles: [{ source: '/existing-a', destination: '/dest-a' }],
      afterFiles: [{ source: '/existing-b', destination: '/dest-b' }],
      fallback: [{ source: '/existing-c', destination: '/dest-c' }]
    };

    const wrapped = withRouteHandlerRewrites(
      {
        rewrites: async (): Promise<RouteHandlerRewritePhases> =>
          existingRewritePhases
      },
      routeRewrites
    );

    const rewrites = await wrapped.rewrites();
    const [generatedRewrite, existingBeforeFileRewrite] = rewrites.beforeFiles;

    expect(generatedRewrite).toEqual({
      source: '/content/example',
      destination: '/content/generated-handlers/example/en',
      locale: false
    });
    expect(existingBeforeFileRewrite).toEqual({
      source: '/existing-a',
      destination: '/dest-a'
    });
    expect(rewrites.afterFiles).toEqual([
      {
        source: '/existing-b',
        destination: '/dest-b'
      }
    ]);
    expect(rewrites.fallback).toEqual([
      {
        source: '/existing-c',
        destination: '/dest-c'
      }
    ]);
  });

  it('dedupes rewrites without relying on delimiter-packed string keys', async () => {
    const duplicateRewritePhases: RouteHandlerRewritePhases = {
      beforeFiles: [
        {
          source: '/content/value|item',
          destination: '/content/generated-handlers/value|item'
        },
        {
          source: '/content/value|item',
          destination: '/content/generated-handlers/value|item'
        },
        {
          source: '/content/value|item',
          destination: '/content/generated-handlers/value|item',
          locale: false
        }
      ],
      afterFiles: [],
      fallback: []
    };

    const wrapped = withRouteHandlerRewrites(
      {
        rewrites: async (): Promise<RouteHandlerRewritePhases> =>
          duplicateRewritePhases
      },
      []
    );

    const rewrites = await wrapped.rewrites();

    expect(rewrites.beforeFiles).toEqual([
      {
        source: '/content/value|item',
        destination: '/content/generated-handlers/value|item'
      },
      {
        source: '/content/value|item',
        destination: '/content/generated-handlers/value|item',
        locale: false
      }
    ]);
  });
});
