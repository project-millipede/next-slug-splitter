import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  absoluteFileModule,
  appRelativeModule,
  packageModule
} from '../../module-reference';
import {
  createCatchAllRouteHandlersPreset,
  findNextConfigPath,
  resolveRouteHandlersConfig,
  resolveRouteHandlersConfigs
} from '../../next/config/index';
import {
  TEST_CATCH_ALL_ROUTE_PARAM_NAME,
  TEST_COMPONENT_IMPORT_NAME,
  TEST_COMPONENT_IMPORT_SOURCE,
  TEST_PRIMARY_CONTENT_PAGES_DIR,
  TEST_PRIMARY_FACTORY_IMPORT,
  TEST_PRIMARY_REGISTRY_IMPORT,
  TEST_PRIMARY_ROUTE_SEGMENT,
  TEST_SECONDARY_CONTENT_PAGES_DIR,
  TEST_SECONDARY_FACTORY_IMPORT,
  TEST_SECONDARY_REGISTRY_IMPORT,
  TEST_SECONDARY_ROUTE_SEGMENT,
  TEST_SINGLE_ROUTE_PARAM_NAME,
  createTestHandlerBinding,
  createTestRuntimeTraitBinding,
  writeTestBaseStaticPropsPage,
  writeTestRouteHandlerPackage
} from '../helpers/fixtures';
import { withTempDir } from '../helpers/temp-dir';

import type { RegistryEntry, RegistryImport } from '../../core/types';
import type { RouteHandlersConfig } from '../../next/types';

const TEST_COMPONENT_IMPORT: RegistryImport = {
  source: TEST_COMPONENT_IMPORT_SOURCE,
  kind: 'named',
  importedName: TEST_COMPONENT_IMPORT_NAME
};

const createNextConfig = () => ({
  i18n: {
    locales: ['en', 'de'],
    defaultLocale: 'en'
  }
});

const createAppConfig = (rootDir: string) => ({
  rootDir,
  nextConfigPath: path.join(rootDir, 'mocked-app-config.js')
});

describe('next config helpers', () => {
  it('finds the first supported Next config filename in rootDir', async () => {
    await withTempDir('next-slug-splitter-next-config-', async rootDir => {
      const jsConfigPath = path.join(rootDir, 'next.config.js');
      const mjsConfigPath = path.join(rootDir, 'next.config.mjs');

      await writeFile(mjsConfigPath, 'export default {};\n', 'utf8');
      await writeFile(jsConfigPath, 'module.exports = {};\n', 'utf8');

      expect(findNextConfigPath(rootDir)).toBe(jsConfigPath);
    });
  });

  it('creates catch-all preset from route segment and app-relative paths', () => {
    const routeHandlersConfig = createCatchAllRouteHandlersPreset({
      routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
      handlerRouteParam: {
        name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
        kind: 'catch-all'
      },
      contentPagesDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
      handlerBinding: createTestHandlerBinding()
    });

    expect(routeHandlersConfig.baseStaticPropsImport).toEqual(
      appRelativeModule('pages/content/[...entry]')
    );
    expect(routeHandlersConfig.targetId).toBe(TEST_PRIMARY_ROUTE_SEGMENT);
    expect(routeHandlersConfig.routeBasePath).toBe('/content');
    expect(routeHandlersConfig.paths?.contentPagesDir).toBe(
      TEST_PRIMARY_CONTENT_PAGES_DIR
    );
    expect(routeHandlersConfig.handlerBinding.registryImport).toEqual(
      packageModule(TEST_PRIMARY_REGISTRY_IMPORT)
    );
    expect(routeHandlersConfig.paths?.handlersDir).toBe(
      path.join('pages', 'content', '_handlers')
    );
  });

  it('supports single-segment route params via handlerRouteParam', () => {
    const routeHandlersConfig = createCatchAllRouteHandlersPreset({
      routeSegment: TEST_SECONDARY_ROUTE_SEGMENT,
      handlerRouteParam: {
        name: TEST_SINGLE_ROUTE_PARAM_NAME,
        kind: 'single'
      },
      contentPagesDir: TEST_SECONDARY_CONTENT_PAGES_DIR,
      handlerBinding: createTestHandlerBinding({
        registryImport: packageModule(TEST_SECONDARY_REGISTRY_IMPORT),
        importBase: packageModule(TEST_SECONDARY_FACTORY_IMPORT)
      })
    });

    expect(routeHandlersConfig.baseStaticPropsImport).toEqual(
      appRelativeModule('pages/secondary/[item]')
    );
    expect(routeHandlersConfig.targetId).toBe(TEST_SECONDARY_ROUTE_SEGMENT);
    expect(routeHandlersConfig.routeBasePath).toBe('/secondary');
    expect(routeHandlersConfig.paths?.handlersDir).toBe(
      path.join('pages', 'secondary', '_handlers')
    );
  });

  it('supports non-localized content mode via contentLocaleMode', async () => {
    await withTempDir('next-slug-splitter-config-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);
      await writeTestBaseStaticPropsPage(rootDir, {
        routeSegment: TEST_SECONDARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_SINGLE_ROUTE_PARAM_NAME,
          kind: 'single'
        }
      });

      const routeHandlersConfig = createCatchAllRouteHandlersPreset({
        routeSegment: TEST_SECONDARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_SINGLE_ROUTE_PARAM_NAME,
          kind: 'single'
        },
        contentLocaleMode: 'default-locale',
        contentPagesDir: TEST_SECONDARY_CONTENT_PAGES_DIR,
        handlerBinding: createTestHandlerBinding({
          registryImport: packageModule(TEST_SECONDARY_REGISTRY_IMPORT),
          importBase: packageModule(TEST_SECONDARY_FACTORY_IMPORT)
        })
      });

      const resolvedConfig = resolveRouteHandlersConfig({
        rootDir,
        nextConfig: createNextConfig(),
        routeHandlersConfig: {
          app: createAppConfig(rootDir),
          ...routeHandlersConfig
        }
      });

      expect(resolvedConfig.contentLocaleMode).toBe('default-locale');
    });
  });

  it('rejects target-level rootDir overrides', async () => {
    await withTempDir('next-slug-splitter-config-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);

      expect(() =>
        resolveRouteHandlersConfig({
          rootDir,
          nextConfig: createNextConfig(),
          routeHandlersConfig: {
            app: createAppConfig(rootDir),
            ...createCatchAllRouteHandlersPreset({
              routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
              handlerRouteParam: {
                name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
                kind: 'catch-all'
              },
              contentPagesDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
              handlerBinding: createTestHandlerBinding()
            }),
            paths: {
              rootDir: '/tmp/other-root'
            } as RouteHandlersConfig['paths'] & { rootDir: string }
          }
        })
      ).toThrow(
        '[next-slug-splitter] paths.rootDir is no longer supported. Configure routeHandlersConfig.app.rootDir instead.'
      );
    });
  });

  it('rejects legacy runtimeHandlerFactoryImport config', async () => {
    await withTempDir('next-slug-splitter-config-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);

      expect(() =>
        resolveRouteHandlersConfig({
          rootDir,
          nextConfig: createNextConfig(),
          routeHandlersConfig: {
            app: createAppConfig(rootDir),
            ...createCatchAllRouteHandlersPreset({
              routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
              handlerRouteParam: {
                name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
                kind: 'catch-all'
              },
              contentPagesDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
              handlerBinding: createTestHandlerBinding()
            }),
            runtimeHandlerFactoryImport: TEST_PRIMARY_FACTORY_IMPORT
          } as RouteHandlersConfig
        })
      ).toThrow(
        '[next-slug-splitter] runtimeHandlerFactoryImport has been replaced by handlerBinding.runtimeFactory.importBase.'
      );
    });
  });

  it('resolves multi-target configs via targets array', async () => {
    await withTempDir('next-slug-splitter-config-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);
      await writeTestBaseStaticPropsPage(rootDir, {
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        }
      });
      await writeTestBaseStaticPropsPage(rootDir, {
        routeSegment: TEST_SECONDARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_SINGLE_ROUTE_PARAM_NAME,
          kind: 'single'
        }
      });

      const routeHandlersConfig: RouteHandlersConfig = {
        app: createAppConfig(rootDir),
        targets: [
          createCatchAllRouteHandlersPreset({
            routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
            handlerRouteParam: {
              name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
              kind: 'catch-all'
            },
            contentPagesDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
            handlerBinding: createTestHandlerBinding()
          }),
          createCatchAllRouteHandlersPreset({
            routeSegment: TEST_SECONDARY_ROUTE_SEGMENT,
            handlerRouteParam: {
              name: TEST_SINGLE_ROUTE_PARAM_NAME,
              kind: 'single'
            },
            contentPagesDir: TEST_SECONDARY_CONTENT_PAGES_DIR,
            handlerBinding: createTestHandlerBinding({
              registryImport: packageModule(TEST_SECONDARY_REGISTRY_IMPORT),
              importBase: packageModule(TEST_SECONDARY_FACTORY_IMPORT)
            })
          })
        ]
      };

      const resolvedConfigs = resolveRouteHandlersConfigs({
        rootDir,
        nextConfig: createNextConfig(),
        routeHandlersConfig
      });

      expect(resolvedConfigs).toHaveLength(2);
      const [contentResolvedConfig, secondaryResolvedConfig] = resolvedConfigs;

      expect(contentResolvedConfig.targetId).toBe(TEST_PRIMARY_ROUTE_SEGMENT);
      expect(contentResolvedConfig.routeBasePath).toBe('/content');
      expect(contentResolvedConfig.baseStaticPropsImport).toEqual(
        absoluteFileModule(path.join(rootDir, 'pages', 'content', '[...entry]'))
      );
      expect(contentResolvedConfig.runtimeHandlerFactoryImportBase).toEqual(
        packageModule(TEST_PRIMARY_FACTORY_IMPORT)
      );
      expect(secondaryResolvedConfig.targetId).toBe(
        TEST_SECONDARY_ROUTE_SEGMENT
      );
      expect(secondaryResolvedConfig.routeBasePath).toBe('/secondary');
      expect(secondaryResolvedConfig.baseStaticPropsImport).toEqual(
        absoluteFileModule(path.join(rootDir, 'pages', 'secondary', '[item]'))
      );
      expect(secondaryResolvedConfig.runtimeHandlerFactoryImportBase).toEqual(
        packageModule(TEST_SECONDARY_FACTORY_IMPORT)
      );
      expect(secondaryResolvedConfig.contentLocaleMode).toBe('filename');
    });
  });

  it('derives handler factory variant resolver from handlerBinding', async () => {
    await withTempDir('next-slug-splitter-config-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);
      await writeTestBaseStaticPropsPage(rootDir, {
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        }
      });

      const routeHandlersConfig = createCatchAllRouteHandlersPreset({
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        },
        contentPagesDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
        handlerBinding: createTestRuntimeTraitBinding()
      });
      const resolvedConfig = resolveRouteHandlersConfig({
        rootDir,
        nextConfig: createNextConfig(),
        routeHandlersConfig: {
          app: createAppConfig(rootDir),
          ...routeHandlersConfig
        }
      });

      const selectionEntries: Array<RegistryEntry> = [
        {
          key: 'SelectionComponent',
          componentImport: TEST_COMPONENT_IMPORT,
          runtimeTraits: ['selection']
        }
      ];
      const wrapperEntries: Array<RegistryEntry> = [
        {
          key: 'WrapperComponent',
          componentImport: TEST_COMPONENT_IMPORT,
          runtimeTraits: ['wrapper']
        }
      ];
      const defaultEntries: Array<RegistryEntry> = [
        {
          key: 'CustomComponent',
          componentImport: TEST_COMPONENT_IMPORT,
          runtimeTraits: []
        }
      ];

      expect(resolvedConfig.resolveHandlerFactoryVariant(selectionEntries)).toBe(
        'selection'
      );
      expect(resolvedConfig.resolveHandlerFactoryVariant(wrapperEntries)).toBe(
        'wrapper'
      );
      expect(resolvedConfig.resolveHandlerFactoryVariant(defaultEntries)).toBe(
        'none'
      );
    });
  });

  it('rejects handler bindings with missing resolvable variant imports', async () => {
    await withTempDir('next-slug-splitter-handler-binding-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir, {
        primaryVariants: ['none']
      });

      expect(() =>
        resolveRouteHandlersConfig({
          rootDir,
          nextConfig: createNextConfig(),
          routeHandlersConfig: {
            app: createAppConfig(rootDir),
            ...createCatchAllRouteHandlersPreset({
              routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
              handlerRouteParam: {
                name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
                kind: 'catch-all'
              },
              contentPagesDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
              handlerBinding: createTestHandlerBinding({
                variants: ['none', 'selection']
              })
            })
          }
        })
      ).toThrow(
        `[next-slug-splitter] handlerBinding.runtimeFactory.importBase "${TEST_PRIMARY_FACTORY_IMPORT}" is missing resolvable variant import "${TEST_PRIMARY_FACTORY_IMPORT}/selection" from "${rootDir}".`
      );
    });
  });
});
