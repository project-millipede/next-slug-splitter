import { describe, expect, it } from 'vitest';

import { withRouteHandlerRewrites } from '../../../next/shared/rewrites/plugin';

import type {
  RouteHandlerRewrite,
  RouteHandlerRewritePhases
} from '../../../next/shared/types';

describe('rewrite plugin', () => {
  it('maps library rewrite arrays to beforeFiles and preserves user phases', async () => {
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

  it('maps user rewrite arrays to afterFiles while library arrays map to beforeFiles', async () => {
    const wrapped = withRouteHandlerRewrites(
      {
        rewrites: async (): Promise<Array<RouteHandlerRewrite>> => [
          {
            source: '/user-array',
            destination: '/user-array-to'
          }
        ]
      },
      [
        {
          source: '/library-array',
          destination: '/library-array-to',
          locale: false
        }
      ]
    );

    const rewrites = await wrapped.rewrites();

    expect(rewrites).toEqual({
      beforeFiles: [
        {
          source: '/library-array',
          destination: '/library-array-to',
          locale: false
        }
      ],
      afterFiles: [
        {
          source: '/user-array',
          destination: '/user-array-to'
        }
      ],
      fallback: []
    });
  });

  it('merges explicit library phases around user phases', async () => {
    const existingRewritePhases: RouteHandlerRewritePhases = {
      beforeFiles: [{ source: '/user-before', destination: '/user-before-to' }],
      afterFiles: [{ source: '/user-after', destination: '/user-after-to' }],
      fallback: [{ source: '/user-fallback', destination: '/user-fallback-to' }]
    };

    const wrapped = withRouteHandlerRewrites(
      {
        rewrites: async (): Promise<RouteHandlerRewritePhases> =>
          existingRewritePhases
      },
      {
        beforeFiles: [
          {
            source: '/library-before',
            destination: '/library-before-to',
            locale: false
          }
        ],
        afterFiles: [
          {
            source: '/library-after',
            destination: '/library-after-to',
            locale: false
          }
        ],
        fallback: [
          {
            source: '/library-fallback',
            destination: '/library-fallback-to',
            locale: false
          }
        ]
      }
    );

    const rewrites = await wrapped.rewrites();

    expect(rewrites.beforeFiles).toEqual([
      {
        source: '/library-before',
        destination: '/library-before-to',
        locale: false
      },
      {
        source: '/user-before',
        destination: '/user-before-to'
      }
    ]);
    expect(rewrites.afterFiles).toEqual([
      {
        source: '/user-after',
        destination: '/user-after-to'
      },
      {
        source: '/library-after',
        destination: '/library-after-to',
        locale: false
      }
    ]);
    expect(rewrites.fallback).toEqual([
      {
        source: '/user-fallback',
        destination: '/user-fallback-to'
      },
      {
        source: '/library-fallback',
        destination: '/library-fallback-to',
        locale: false
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
