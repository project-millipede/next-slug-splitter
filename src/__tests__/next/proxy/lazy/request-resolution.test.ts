import path from 'node:path';

import { beforeEach, describe, expect, test, vi } from 'vitest';

const resolveLocalizedContentRouteMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../../core/discovery'), async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../../../core/discovery')>();

  return {
    ...actual,
    resolveLocalizedContentRoute: resolveLocalizedContentRouteMock
  };
});

import { resolveRouteHandlerLazyRequest } from '../../../../next/proxy/lazy/request-resolution';
import {
  TEST_LOCALE_CONFIG,
  TEST_MULTI_LOCALE_CONFIG
} from '../../../helpers/fixtures';

import type { LocalizedRoutePath } from '../../../../core/types';
import type {
  RouteHandlerLazyRequestIdentity,
  RouteHandlerLazyRequestResolution,
  RouteHandlerLazyResolvedTarget
} from '../../../../next/proxy/lazy/types';

const rootDir = '/repo/app';
const localeConfig = TEST_MULTI_LOCALE_CONFIG;
const singleLocaleConfig = TEST_LOCALE_CONFIG;
const docsConfig: RouteHandlerLazyResolvedTarget = {
  routerKind: 'pages' as const,
  targetId: 'docs',
  routeBasePath: '/docs',
  contentLocaleMode: 'filename' as const,
  emitFormat: 'ts' as const,
  localeConfig,
  paths: {
    contentDir: path.join(rootDir, 'docs', 'src', 'pages'),
    generatedDir: path.join(rootDir, 'pages', 'docs', 'generated-handlers')
  }
};
const blogConfig: RouteHandlerLazyResolvedTarget = {
  routerKind: 'pages' as const,
  targetId: 'blog',
  routeBasePath: '/blog',
  contentLocaleMode: 'default-locale' as const,
  emitFormat: 'ts' as const,
  localeConfig,
  paths: {
    contentDir: path.join(rootDir, 'blog', 'src', 'pages'),
    generatedDir: path.join(rootDir, 'pages', 'blog', 'generated-handlers')
  }
};
const resolvedTargets: Array<RouteHandlerLazyResolvedTarget> = [
  docsConfig,
  blogConfig
];
const singleLocaleResolvedTargets: Array<RouteHandlerLazyResolvedTarget> = [
  {
    ...docsConfig,
    localeConfig: singleLocaleConfig
  },
  {
    ...blogConfig,
    localeConfig: singleLocaleConfig
  }
];

describe('proxy lazy request resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns no-target when the pathname does not belong to any configured target', async () => {
    await expect(
      resolveRouteHandlerLazyRequest('/marketing/launch', [])
    ).resolves.toEqual({
      kind: 'no-target',
      pathname: '/marketing/launch'
    });
  });

  test('does not treat default-locale-prefixed public aliases as valid in single-locale mode', async () => {
    await expect(
      resolveRouteHandlerLazyRequest(
        '/en/docs/getting-started',
        singleLocaleResolvedTargets
      )
    ).resolves.toEqual({
      kind: 'no-target',
      pathname: '/en/docs/getting-started'
    });

    expect(resolveLocalizedContentRouteMock).not.toHaveBeenCalled();
  });

  type Scenario = {
    id: string;
    description: string;
    pathname: string;
    resolvedRoutePath: LocalizedRoutePath | null;
    expected: Extract<
      RouteHandlerLazyRequestResolution,
      {
        kind: 'matched-route-file' | 'missing-route-file';
      }
    >;
  };

  const scenarios: ReadonlyArray<Scenario> = [
    {
      id: 'Default-Locale-Filename',
      description:
        'resolves a default-locale filename-mode request to the concrete content file',
      pathname: '/docs/getting-started',
      resolvedRoutePath: {
        locale: 'en',
        slugArray: ['getting-started'],
        filePath: path.join(
          rootDir,
          'docs',
          'src',
          'pages',
          'getting-started',
          'en.mdx'
        )
      },
      expected: {
        kind: 'matched-route-file',
        pathname: '/docs/getting-started',
        config: docsConfig,
        identity: {
          pathname: '/docs/getting-started',
          locale: 'en',
          slugArray: ['getting-started']
        },
        routePath: {
          locale: 'en',
          slugArray: ['getting-started'],
          filePath: path.join(
            rootDir,
            'docs',
            'src',
            'pages',
            'getting-started',
            'en.mdx'
          )
        }
      }
    },
    {
      id: 'Localized-Filename',
      description:
        'resolves a localized filename-mode request to the locale-specific content file',
      pathname: '/de/docs/getting-started',
      resolvedRoutePath: {
        locale: 'de',
        slugArray: ['getting-started'],
        filePath: path.join(
          rootDir,
          'docs',
          'src',
          'pages',
          'getting-started',
          'de.mdx'
        )
      },
      expected: {
        kind: 'matched-route-file',
        pathname: '/de/docs/getting-started',
        config: docsConfig,
        identity: {
          pathname: '/de/docs/getting-started',
          locale: 'de',
          slugArray: ['getting-started']
        },
        routePath: {
          locale: 'de',
          slugArray: ['getting-started'],
          filePath: path.join(
            rootDir,
            'docs',
            'src',
            'pages',
            'getting-started',
            'de.mdx'
          )
        }
      }
    },
    {
      id: 'Default-Locale-Content',
      description:
        'resolves default-locale content mode without requiring locale-named files',
      pathname: '/blog/application-extensibility',
      resolvedRoutePath: {
        locale: 'en',
        slugArray: ['application-extensibility'],
        filePath: path.join(
          rootDir,
          'blog',
          'src',
          'pages',
          'application-extensibility.mdx'
        )
      },
      expected: {
        kind: 'matched-route-file',
        pathname: '/blog/application-extensibility',
        config: blogConfig,
        identity: {
          pathname: '/blog/application-extensibility',
          locale: 'en',
          slugArray: ['application-extensibility']
        },
        routePath: {
          locale: 'en',
          slugArray: ['application-extensibility'],
          filePath: path.join(
            rootDir,
            'blog',
            'src',
            'pages',
            'application-extensibility.mdx'
          )
        }
      }
    },
    {
      id: 'Missing-Route-File',
      description:
        'distinguishes a missing content file from a pathname inside a known target',
      pathname: '/docs/missing-page',
      resolvedRoutePath: null,
      expected: {
        kind: 'missing-route-file',
        pathname: '/docs/missing-page',
        config: docsConfig,
        identity: {
          pathname: '/docs/missing-page',
          locale: 'en',
          slugArray: ['missing-page']
        }
      }
    }
  ];

  test.for(scenarios)(
    '[$id] $description',
    async ({ pathname, resolvedRoutePath, expected }) => {
      resolveLocalizedContentRouteMock.mockResolvedValue(resolvedRoutePath);

      await expect(
        resolveRouteHandlerLazyRequest(pathname, resolvedTargets)
      ).resolves.toEqual(expected);
    }
  );
});
