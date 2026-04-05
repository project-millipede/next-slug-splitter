import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { packageModule } from '../../../module-reference';
import {
  createRouteHandlerLazyResolvedTargetsFromProxyBootstrap,
  createRouteHandlerPlannerConfigsByIdFromProxyBootstrap,
  createRouteHandlerProxyBootstrapManifest,
  readRouteHandlerProxyBootstrap,
  resolveRouteHandlerProxyBootstrapPath,
  writeRouteHandlerProxyBootstrap
} from '../../../next/proxy/bootstrap-persisted';
import { withTempDir } from '../../helpers/temp-dir';

import type { LocaleConfig } from '../../../core/types';
import type { ResolvedRouteHandlersConfig } from '../../../next/types';

const TEST_LOCALE_CONFIG: LocaleConfig = {
  locales: ['en', 'de'],
  defaultLocale: 'en'
};

const createResolvedConfigFixture = (
  rootDir: string,
  {
    targetId = 'docs',
    routeBasePath = '/docs'
  }: {
    targetId?: string;
    routeBasePath?: string;
  } = {}
): ResolvedRouteHandlersConfig =>
  ({
    app: {
      rootDir,
      routing: {
        development: 'proxy'
      }
    },
    targetId,
    routeBasePath,
    contentLocaleMode: 'filename',
    emitFormat: 'ts',
    handlerRouteParam: {
      name: 'slug',
      kind: 'catch-all'
    },
    baseStaticPropsImport: packageModule('@test/base-static-props'),
    processorConfig: {
      kind: 'module',
      processorImport: packageModule('@test/processor')
    },
    paths: {
      rootDir,
      contentPagesDir: `${rootDir}/content/pages`,
      handlersDir: `${rootDir}/pages/_handlers`
    },
    localeConfig: TEST_LOCALE_CONFIG,
    runtime: {
      mdxCompileOptions: {}
    }
  }) as unknown as ResolvedRouteHandlersConfig;

const createBootstrapManifest = (
  rootDir: string,
  resolvedConfigs: Array<ResolvedRouteHandlersConfig> = [
    createResolvedConfigFixture(rootDir)
  ]
) =>
  createRouteHandlerProxyBootstrapManifest(
    'bootstrap-token',
    TEST_LOCALE_CONFIG,
    resolvedConfigs
  );

describe('proxy bootstrap persistence', () => {
  const ORIGINAL_CWD = process.cwd();

  afterEach(() => {
    process.chdir(ORIGINAL_CWD);
  });

  it('writes and reads a structural proxy bootstrap manifest', async () => {
    await withTempDir('next-slug-splitter-proxy-bootstrap-', async rootDir => {
      const manifest = createBootstrapManifest(rootDir, [
        createResolvedConfigFixture(rootDir),
        createResolvedConfigFixture(rootDir, {
          targetId: 'guides',
          routeBasePath: '/guides'
        })
      ]);

      await writeRouteHandlerProxyBootstrap(rootDir, manifest);

      await expect(readRouteHandlerProxyBootstrap(rootDir)).resolves.toEqual(
        manifest
      );
    });
  });

  it('returns null for invalid persisted bootstrap content', async () => {
    await withTempDir('next-slug-splitter-proxy-bootstrap-', async rootDir => {
      const bootstrapPath = resolveRouteHandlerProxyBootstrapPath(rootDir);

      await mkdir(path.dirname(bootstrapPath), {
        recursive: true
      });
      await writeFile(
        bootstrapPath,
        '{"invalid":true}\n',
        'utf8'
      );

      await expect(readRouteHandlerProxyBootstrap(rootDir)).resolves.toBeNull();
    });
  });

  it('derives lightweight request-resolution targets from the manifest', () => {
    const rootDir = '/repo/app';
    const manifest = createBootstrapManifest(rootDir);

    expect(createRouteHandlerLazyResolvedTargetsFromProxyBootstrap(manifest)).toEqual(
      [
        {
          targetId: 'docs',
          routeBasePath: '/docs',
          contentLocaleMode: 'filename',
          localeConfig: TEST_LOCALE_CONFIG,
          emitFormat: 'ts',
          paths: {
            contentPagesDir: '/repo/app/content/pages',
            handlersDir: '/repo/app/pages/_handlers'
          }
        }
      ]
    );
  });

  it('derives structural planner configs without runtime attachments', () => {
    const rootDir = '/repo/app';
    const manifest = createBootstrapManifest(rootDir);
    const config = createRouteHandlerPlannerConfigsByIdFromProxyBootstrap(
      manifest
    ).get('docs');

    expect(config).toMatchObject({
      targetId: 'docs',
      routeBasePath: '/docs',
      contentLocaleMode: 'filename',
      emitFormat: 'ts',
      handlerRouteParam: {
        name: 'slug',
        kind: 'catch-all'
      },
      baseStaticPropsImport: packageModule('@test/base-static-props'),
      processorConfig: {
        kind: 'module',
        processorImport: packageModule('@test/processor')
      },
      localeConfig: TEST_LOCALE_CONFIG,
      paths: {
        rootDir: '/repo/app',
        contentPagesDir: '/repo/app/content/pages',
        handlersDir: '/repo/app/pages/_handlers'
      }
    });
    expect(config).not.toHaveProperty('runtime');
  });

  it('preserves explicit zero-target bootstrap state', async () => {
    await withTempDir('next-slug-splitter-proxy-bootstrap-', async rootDir => {
      const manifest = createRouteHandlerProxyBootstrapManifest(
        'bootstrap-token',
        {
          locales: ['en'],
          defaultLocale: 'en'
        },
        []
      );

      await writeRouteHandlerProxyBootstrap(rootDir, manifest);

      const persistedManifest = await readRouteHandlerProxyBootstrap(rootDir);

      expect(persistedManifest).toEqual({
        version: 1,
        bootstrapGenerationToken: 'bootstrap-token',
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        },
        targets: []
      });
      expect(
        createRouteHandlerLazyResolvedTargetsFromProxyBootstrap(manifest)
      ).toEqual([]);
      expect(
        createRouteHandlerPlannerConfigsByIdFromProxyBootstrap(manifest)
      ).toEqual(new Map());
    });
  });
});
