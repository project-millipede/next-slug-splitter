import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCatchAllRouteHandlersPreset } from '../../../../next/config';
import {
  TEST_CATCH_ALL_ROUTE_PARAM_NAME,
  createTestHandlerBinding
} from '../../../helpers/fixtures';
import { withTempDir } from '../../../helpers/temp-dir';

import type { RouteHandlersConfig } from '../../../../next/types';

const loadRegisteredSlugSplitterConfigMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../next/integration/slug-splitter-config-loader', () => ({
  loadRegisteredSlugSplitterConfig: loadRegisteredSlugSplitterConfigMock
}));

import { resolveRouteHandlerLazyRequest } from '../../../../next/proxy/lazy/request-resolution';

const createMultiTargetConfig = (rootDir: string): RouteHandlersConfig => ({
  app: {
    rootDir,
    nextConfigPath: path.join(rootDir, 'next.config.mjs')
  },
  targets: [
    createCatchAllRouteHandlersPreset({
      routeSegment: 'docs',
      handlerRouteParam: {
        name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
        kind: 'catch-all'
      },
      contentPagesDir: path.join(rootDir, 'docs', 'src', 'pages'),
      handlerBinding: createTestHandlerBinding()
    }),
    createCatchAllRouteHandlersPreset({
      routeSegment: 'blog',
      contentLocaleMode: 'default-locale',
      handlerRouteParam: {
        name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
        kind: 'catch-all'
      },
      contentPagesDir: path.join(rootDir, 'blog', 'src', 'pages'),
      handlerBinding: createTestHandlerBinding()
    })
  ]
});

describe('proxy lazy request resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no-target when the pathname does not belong to any configured target', async () => {
    loadRegisteredSlugSplitterConfigMock.mockResolvedValue(undefined);

    await expect(
      resolveRouteHandlerLazyRequest({
        pathname: '/marketing/launch',
        localeConfig: {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        }
      })
    ).resolves.toEqual({
      kind: 'no-target',
      pathname: '/marketing/launch'
    });
  });

  it('resolves a default-locale filename-mode request to the concrete content file', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-resolution-',
      async rootDir => {
        const routeHandlersConfig = createMultiTargetConfig(rootDir);
        const docsPagesDir = path.join(rootDir, 'docs', 'src', 'pages');

        await mkdir(path.join(docsPagesDir, 'getting-started'), {
          recursive: true
        });
        await writeFile(
          path.join(docsPagesDir, 'getting-started', 'en.mdx'),
          '# EN',
          'utf8'
        );
        await writeFile(
          path.join(docsPagesDir, 'getting-started', 'de.mdx'),
          '# DE',
          'utf8'
        );

        loadRegisteredSlugSplitterConfigMock.mockResolvedValue(
          routeHandlersConfig
        );

        const result = await resolveRouteHandlerLazyRequest({
          pathname: '/docs/getting-started',
          localeConfig: {
            locales: ['en', 'de'],
            defaultLocale: 'en'
          }
        });

        expect(result.kind).toBe('matched-route-file');
        if (result.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        expect(result.config.routeBasePath).toBe('/docs');
        expect(result.identity).toEqual({
          pathname: '/docs/getting-started',
          locale: 'en',
          slugArray: ['getting-started']
        });
        expect(result.routePath.filePath).toBe(
          path.join(docsPagesDir, 'getting-started', 'en.mdx')
        );
      }
    );
  });

  it('resolves a localized filename-mode request to the concrete locale-specific content file', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-resolution-',
      async rootDir => {
        const routeHandlersConfig = createMultiTargetConfig(rootDir);
        const docsPagesDir = path.join(rootDir, 'docs', 'src', 'pages');

        await mkdir(path.join(docsPagesDir, 'getting-started'), {
          recursive: true
        });
        await writeFile(
          path.join(docsPagesDir, 'getting-started', 'de.mdx'),
          '# DE',
          'utf8'
        );

        loadRegisteredSlugSplitterConfigMock.mockResolvedValue(
          routeHandlersConfig
        );

        const result = await resolveRouteHandlerLazyRequest({
          pathname: '/de/docs/getting-started',
          localeConfig: {
            locales: ['en', 'de'],
            defaultLocale: 'en'
          }
        });

        expect(result.kind).toBe('matched-route-file');
        if (result.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        expect(result.identity).toEqual({
          pathname: '/de/docs/getting-started',
          locale: 'de',
          slugArray: ['getting-started']
        });
        expect(result.routePath.filePath).toBe(
          path.join(docsPagesDir, 'getting-started', 'de.mdx')
        );
      }
    );
  });

  it('resolves default-locale content mode without requiring locale-named files', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-resolution-',
      async rootDir => {
        const routeHandlersConfig = createMultiTargetConfig(rootDir);
        const blogPagesDir = path.join(rootDir, 'blog', 'src', 'pages');

        await mkdir(blogPagesDir, {
          recursive: true
        });
        await writeFile(
          path.join(blogPagesDir, 'application-extensibility.mdx'),
          '# Blog',
          'utf8'
        );

        loadRegisteredSlugSplitterConfigMock.mockResolvedValue(
          routeHandlersConfig
        );

        const result = await resolveRouteHandlerLazyRequest({
          pathname: '/blog/application-extensibility',
          localeConfig: {
            locales: ['en', 'de'],
            defaultLocale: 'en'
          }
        });

        expect(result.kind).toBe('matched-route-file');
        if (result.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        expect(result.config.routeBasePath).toBe('/blog');
        expect(result.identity).toEqual({
          pathname: '/blog/application-extensibility',
          locale: 'en',
          slugArray: ['application-extensibility']
        });
        expect(result.routePath.filePath).toBe(
          path.join(blogPagesDir, 'application-extensibility.mdx')
        );
      }
    );
  });

  it('distinguishes a missing content file from a pathname outside all targets', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-resolution-',
      async rootDir => {
        const routeHandlersConfig = createMultiTargetConfig(rootDir);

        loadRegisteredSlugSplitterConfigMock.mockResolvedValue(
          routeHandlersConfig
        );

        const result = await resolveRouteHandlerLazyRequest({
          pathname: '/docs/missing-page',
          localeConfig: {
            locales: ['en', 'de'],
            defaultLocale: 'en'
          }
        });

        expect(result.kind).toBe('missing-route-file');
        if (result.kind !== 'missing-route-file') {
          throw new Error('Expected missing-route-file resolution.');
        }

        expect(result.config.routeBasePath).toBe('/docs');
        expect(result.identity).toEqual({
          pathname: '/docs/missing-page',
          locale: 'en',
          slugArray: ['missing-page']
        });
      }
    );
  });
});
