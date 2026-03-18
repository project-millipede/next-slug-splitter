import { mkdir, writeFile } from 'node:fs/promises';
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
  TEST_PRIMARY_COMPONENTS_IMPORT,
  TEST_PRIMARY_CONTENT_PAGES_DIR,
  TEST_PRIMARY_FACTORY_IMPORT,
  TEST_PRIMARY_ROUTE_SEGMENT,
  TEST_SECONDARY_CONTENT_PAGES_DIR,
  TEST_SECONDARY_COMPONENTS_IMPORT,
  TEST_SECONDARY_FACTORY_IMPORT,
  TEST_SECONDARY_ROUTE_SEGMENT,
  TEST_SINGLE_ROUTE_PARAM_NAME,
  createTestHandlerBinding,
  writeTestBaseStaticPropsPage,
  writeTestRouteHandlerPackage
} from '../helpers/fixtures';
import { withTempDir } from '../helpers/temp-dir';

import type { RouteHandlersConfig } from '../../next/types';

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

function testRemarkPlugin() {}
function testRecmaPlugin() {}

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
    expect(routeHandlersConfig.handlerBinding.componentsImport).toEqual(
      packageModule(TEST_PRIMARY_COMPONENTS_IMPORT)
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
        componentsImport: packageModule(TEST_SECONDARY_COMPONENTS_IMPORT),
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
          componentsImport: packageModule(TEST_SECONDARY_COMPONENTS_IMPORT),
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

  it('passes mdxCompileOptions through preset and config resolution', async () => {
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
        handlerBinding: createTestHandlerBinding(),
        mdxCompileOptions: {
          remarkPlugins: [testRemarkPlugin],
          recmaPlugins: [testRecmaPlugin]
        }
      });

      expect(routeHandlersConfig.mdxCompileOptions).toEqual({
        remarkPlugins: [testRemarkPlugin],
        recmaPlugins: [testRecmaPlugin]
      });

      const resolvedConfig = resolveRouteHandlersConfig({
        rootDir,
        nextConfig: createNextConfig(),
        routeHandlersConfig: {
          app: createAppConfig(rootDir),
          ...routeHandlersConfig
        }
      });

      expect(resolvedConfig.mdxCompileOptions).toEqual({
        remarkPlugins: [testRemarkPlugin],
        recmaPlugins: [testRecmaPlugin]
      });
    });
  });

  it('resolves handlerBinding.processorImport from the app root', async () => {
    await withTempDir('next-slug-splitter-config-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);
      await writeTestBaseStaticPropsPage(rootDir, {
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        }
      });
      await mkdir(path.join(rootDir, 'src'), { recursive: true });
      await writeFile(
        path.join(rootDir, 'src', 'route-handler-processor.mjs'),
        'export const routeHandlerProcessor = { ingress: () => ({}), egress: () => ({ factoryVariant: "none", components: [] }) };\n',
        'utf8'
      );

      const resolvedConfig = resolveRouteHandlersConfig({
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
            handlerBinding: {
              componentsImport: packageModule(TEST_PRIMARY_COMPONENTS_IMPORT),
              processorImport: appRelativeModule(
                'src/route-handler-processor.mjs'
              ),
              runtimeFactory: {
                importBase: packageModule(TEST_PRIMARY_FACTORY_IMPORT)
              }
            }
          })
        }
      });

      expect(resolvedConfig.processorConfig).toEqual({
        kind: 'module',
        processorImport: absoluteFileModule(
          path.join(rootDir, 'src', 'route-handler-processor.mjs')
        )
      });
    });
  });

  it('rejects invalid mdxCompileOptions plugin lists', async () => {
    await withTempDir('next-slug-splitter-config-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);
      await writeTestBaseStaticPropsPage(rootDir, {
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        }
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
              handlerBinding: createTestHandlerBinding()
            }),
            mdxCompileOptions: {
              remarkPlugins: 'not-an-array'
            }
          } as unknown as RouteHandlersConfig
        })
      ).toThrow(
        '[next-slug-splitter] mdxCompileOptions.remarkPlugins must be an array.'
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
              componentsImport: packageModule(TEST_SECONDARY_COMPONENTS_IMPORT),
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

});
