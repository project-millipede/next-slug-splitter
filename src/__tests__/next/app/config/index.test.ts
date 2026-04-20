import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { absoluteModule } from '../../../../module-reference';
import { createAppCatchAllRouteHandlersPreset } from '../../../../next/config';
import { resolveRouteHandlerRouterKind } from '../../../../next/shared/config/router-kind';
import { resolveRouteHandlersAppConfig } from '../../../../next/shared/config/app';
import { resolveRouteHandlersConfigBasesFromAppConfig } from '../../../../next/app/config/index';
import {
  createTestHandlerBinding,
  writeTestModule,
  writeTestRouteHandlerPackage
} from '../../../helpers/fixtures';
import { withTempDir } from '../../../helpers/temp-dir';

import type { AppRouteHandlersConfig } from '../../../../next/types';

const createRouteModuleSource = (): string =>
  [
    "export const getStaticParams = async () => [{ slug: ['intro'] }];",
    'export const loadPageProps = async params => ({ params });',
    'export const generatePageMetadata = async params => ({',
    "  title: params.slug.join('/')",
    '});',
    'export const revalidate = 60;',
    ''
  ].join('\n');

const createPageDataCompilerSource = (): string =>
  [
    'export const pageDataCompiler = {',
    '  compile: async ({ input }) => input',
    '};',
    ''
  ].join('\n');

describe('App Router config resolution', () => {
  it('requires routerKind when resolving the router family', () => {
    expect(() => resolveRouteHandlerRouterKind()).toThrow(
      'routeHandlersConfig.routerKind must be "pages" or "app".'
    );
  });

  it('resolves App targets with routeModuleImport and build-time contract inspection', async () => {
    await withTempDir('next-slug-splitter-app-config-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);

      const routeModulePath = path.join(rootDir, 'dist', 'route-module.mjs');
      const pageDataCompilerPath = path.join(
        rootDir,
        'dist',
        'page-data-compiler.mjs'
      );
      await writeTestModule(routeModulePath, createRouteModuleSource());
      await writeTestModule(
        pageDataCompilerPath,
        createPageDataCompilerSource()
      );

      const routeHandlersConfig: AppRouteHandlersConfig = {
        routerKind: 'app',
        app: {
          rootDir
        },
        targetId: 'docs',
        emitFormat: 'ts',
        contentLocaleMode: 'filename',
        handlerRouteParam: {
          name: 'slug',
          kind: 'catch-all'
        },
        handlerBinding: createTestHandlerBinding({
          pageDataCompilerImport: absoluteModule(pageDataCompilerPath)
        }),
        routeBasePath: '/docs',
        routeModuleImport: absoluteModule(routeModulePath),
        paths: {
          contentPagesDir: 'content',
          handlersDir: path.join('app', 'docs', 'generated-handlers')
        }
      };

      const appConfig = resolveRouteHandlersAppConfig({
        rootDir,
        routeHandlersConfig
      });
      const [resolvedTarget] =
        await resolveRouteHandlersConfigBasesFromAppConfig(
          appConfig,
          routeHandlersConfig
        );

      expect(resolvedTarget.routerKind).toBe('app');
      expect(resolvedTarget.targetId).toBe('docs');
      expect(resolvedTarget.handlerRouteSegment).toBe('generated-handlers');
      expect(resolvedTarget.paths.handlersDir).toBe(
        path.join(rootDir, 'app', 'docs', 'generated-handlers')
      );
      expect(resolvedTarget.routeModuleImport).toEqual(
        absoluteModule(routeModulePath)
      );
      expect(resolvedTarget.routeModule).toEqual({
        hasGeneratePageMetadata: true,
        revalidate: 60
      });
      expect(resolvedTarget.pageDataCompilerConfig).toEqual({
        pageDataCompilerImport: absoluteModule(pageDataCompilerPath)
      });
    });
  });

  it('supports a source TypeScript routeModuleImport without a separate runtime artifact', async () => {
    await withTempDir('next-slug-splitter-app-config-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);

      const sourceRouteModulePath = path.join(
        rootDir,
        'app',
        'docs',
        'route-contract.ts'
      );
      await writeTestModule(sourceRouteModulePath, createRouteModuleSource());

      const routeHandlersConfig: AppRouteHandlersConfig = {
        routerKind: 'app',
        app: {
          rootDir
        },
        targetId: 'docs',
        emitFormat: 'ts',
        contentLocaleMode: 'filename',
        handlerRouteParam: {
          name: 'slug',
          kind: 'catch-all'
        },
        handlerBinding: createTestHandlerBinding(),
        routeBasePath: '/docs',
        routeModuleImport: absoluteModule(sourceRouteModulePath),
        paths: {
          contentPagesDir: 'content',
          handlersDir: path.join('app', 'docs', 'generated-handlers')
        }
      };

      const appConfig = resolveRouteHandlersAppConfig({
        rootDir,
        routeHandlersConfig
      });
      const [resolvedTarget] =
        await resolveRouteHandlersConfigBasesFromAppConfig(
          appConfig,
          routeHandlersConfig
        );

      expect(resolvedTarget.handlerRouteSegment).toBe('generated-handlers');
      expect(resolvedTarget.routeModuleImport).toEqual(
        absoluteModule(sourceRouteModulePath)
      );
      expect(resolvedTarget.paths.handlersDir).toBe(
        path.join(rootDir, 'app', 'docs', 'generated-handlers')
      );
      expect(resolvedTarget.routeModule).toEqual({
        hasGeneratePageMetadata: true,
        revalidate: 60
      });
    });
  });

  it('supports App presets that place generated handlers under a route group subtree', async () => {
    await withTempDir('next-slug-splitter-app-config-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);

      const routeModulePath = path.join(rootDir, 'dist', 'route-module.mjs');
      await writeTestModule(routeModulePath, createRouteModuleSource());

      const routeHandlersConfig: AppRouteHandlersConfig = {
        routerKind: 'app',
        app: {
          rootDir
        },
        ...createAppCatchAllRouteHandlersPreset({
          routeSegment: 'docs',
          routeTreeSegment: 'docs/(docs-shared)',
          handlerRouteParam: {
            name: 'slug',
            kind: 'catch-all'
          },
          contentPagesDir: 'content',
          routeModuleImport: absoluteModule(routeModulePath),
          handlerBinding: createTestHandlerBinding()
        })
      };

      const appConfig = resolveRouteHandlersAppConfig({
        rootDir,
        routeHandlersConfig
      });
      const [resolvedTarget] =
        await resolveRouteHandlersConfigBasesFromAppConfig(
          appConfig,
          routeHandlersConfig
        );

      expect(resolvedTarget.targetId).toBe('docs');
      expect(resolvedTarget.routeBasePath).toBe('/docs');
      expect(resolvedTarget.handlerRouteSegment).toBe('generated-handlers');
      expect(resolvedTarget.paths.handlersDir).toBe(
        path.join(rootDir, 'app', 'docs', '(docs-shared)', 'generated-handlers')
      );
    });
  });

  it('fails validation when routeModuleImport is missing', async () => {
    await withTempDir('next-slug-splitter-app-config-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);

      const routeHandlersConfig = {
        routerKind: 'app' as const,
        app: {
          rootDir
        },
        targetId: 'docs',
        emitFormat: 'ts' as const,
        contentLocaleMode: 'filename' as const,
        handlerRouteParam: {
          name: 'slug',
          kind: 'catch-all' as const
        },
        handlerBinding: createTestHandlerBinding(),
        routeBasePath: '/docs',
        paths: {
          contentPagesDir: 'content',
          handlersDir: path.join('app', 'docs', 'generated-handlers')
        }
      };

      const appConfig = resolveRouteHandlersAppConfig({
        rootDir,
        routeHandlersConfig
      });

      await expect(
        resolveRouteHandlersConfigBasesFromAppConfig(
          appConfig,
          routeHandlersConfig as never
        )
      ).rejects.toThrow('routeModuleImport must be a module reference object');
    });
  });

  it('fails validation when the App route contract omits getStaticParams', async () => {
    await withTempDir('next-slug-splitter-app-config-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);

      const routeModulePath = path.join(rootDir, 'dist', 'route-module.mjs');
      await writeTestModule(
        routeModulePath,
        ['export const loadPageProps = async params => ({ params });', ''].join(
          '\n'
        )
      );

      const routeHandlersConfig: AppRouteHandlersConfig = {
        routerKind: 'app',
        app: {
          rootDir
        },
        targetId: 'docs',
        emitFormat: 'ts',
        contentLocaleMode: 'filename',
        handlerRouteParam: {
          name: 'slug',
          kind: 'catch-all'
        },
        handlerBinding: createTestHandlerBinding(),
        routeBasePath: '/docs',
        routeModuleImport: absoluteModule(routeModulePath),
        paths: {
          contentPagesDir: 'content',
          handlersDir: path.join('app', 'docs', 'generated-handlers')
        }
      };

      const appConfig = resolveRouteHandlersAppConfig({
        rootDir,
        routeHandlersConfig
      });

      await expect(
        resolveRouteHandlersConfigBasesFromAppConfig(
          appConfig,
          routeHandlersConfig
        )
      ).rejects.toThrow('must export getStaticParams');
    });
  });

  it('fails validation when the App route contract omits loadPageProps', async () => {
    await withTempDir('next-slug-splitter-app-config-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);

      const routeModulePath = path.join(rootDir, 'dist', 'route-module.mjs');
      await writeTestModule(
        routeModulePath,
        [
          "export const getStaticParams = async () => [{ slug: ['intro'] }];",
          'export const unrelatedHelper = async input => input;',
          ''
        ].join('\n')
      );

      const routeHandlersConfig: AppRouteHandlersConfig = {
        routerKind: 'app',
        app: {
          rootDir
        },
        targetId: 'docs',
        emitFormat: 'ts',
        contentLocaleMode: 'filename',
        handlerRouteParam: {
          name: 'slug',
          kind: 'catch-all'
        },
        handlerBinding: createTestHandlerBinding(),
        routeBasePath: '/docs',
        routeModuleImport: absoluteModule(routeModulePath),
        paths: {
          contentPagesDir: 'content',
          handlersDir: path.join('app', 'docs', 'generated-handlers')
        }
      };

      const appConfig = resolveRouteHandlersAppConfig({
        rootDir,
        routeHandlersConfig
      });

      await expect(
        resolveRouteHandlersConfigBasesFromAppConfig(
          appConfig,
          routeHandlersConfig
        )
      ).rejects.toThrow('must export loadPageProps');
    });
  });
});
