import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { emitRouteHandlerPages } from '../../generator/handlers';
import { renderRouteHandlerModules } from '../../generator/render-modules';
import {
  createContentHandlerModuleInput,
  createLoadableComponentEntry,
  createPlannedHeavyRoute,
  createTestPaths
} from '../helpers/builders';
import { TEST_PRIMARY_FACTORY_IMPORT, TEST_STATIC_PROPS_IMPORT } from '../helpers/fixtures';
import { withTempDir } from '../helpers/temp-dir';

import type { LoadableComponentEntry } from '../../core/types';

describe('generator handlers', () => {
  it('emits static handler page module with inline runtime traits', () => {
    const selectedComponentEntries: Array<LoadableComponentEntry> = [
      createLoadableComponentEntry({
        key: 'WrapperComponent',
        componentImport: {
          source: '@next-slug-splitter-test/components',
          kind: 'named',
          importedName: 'WrapperComponent'
        },
        metadata: {
          runtimeTraits: ['wrapper']
        }
      }),
      createLoadableComponentEntry({
        key: 'SelectionComponent',
        componentImport: {
          source: '@next-slug-splitter-test/components',
          kind: 'named',
          importedName: 'SelectionComponent'
        },
        metadata: {
          runtimeTraits: ['selection']
        }
      })
    ];

    const { pageSource } = renderRouteHandlerModules({
      locale: 'de',
      slugArray: ['nested', 'example'],
      handlerId: 'de-nested-example',
      usedLoadableComponentKeys: ['WrapperComponent', 'SelectionComponent'],
      selectedComponentEntries,
      renderConfig: {
        pageFilePath: '/repo/pages/_handlers/de/nested/example.tsx',
        runtimeHandlerFactoryImport:
          '../../../../../../test-runtime/factory/selection',
        baseStaticPropsImport: '../../../../[...entry]',
        routeBasePath: '/content',
        emitFormat: 'ts'
      }
    });

    expect(pageSource).toContain(
      "from '../../../../../../test-runtime/factory/selection';"
    );
    expect(pageSource).toContain('runtimeTraits: ["wrapper"]');
    expect(pageSource).toContain('runtimeTraits: ["selection"]');
    expect(pageSource).toContain("() => import('../../../../[...entry]')");
    expect(pageSource).toContain('const HandlerPage = createHandlerPage({');
  });

  it('supports custom and package factory base imports', () => {
    const defaultFactorySource = renderRouteHandlerModules({
      locale: 'en',
      slugArray: ['demo'],
      handlerId: 'en-demo',
      usedLoadableComponentKeys: ['Demo'],
      selectedComponentEntries: [
        createLoadableComponentEntry({
          key: 'Demo',
          componentImport: {
            source: '@demo/pkg',
            kind: 'named',
            importedName: 'Demo'
          }
        })
      ],
      renderConfig: {
        pageFilePath: '/repo/pages/_handlers/en/demo.tsx',
        runtimeHandlerFactoryImport: '@next-slug-splitter-test/factory/none',
        baseStaticPropsImport: TEST_STATIC_PROPS_IMPORT,
        routeBasePath: '/content',
        emitFormat: 'ts'
      }
    }).pageSource;

    const packageFactorySource = renderRouteHandlerModules({
      locale: 'en',
      slugArray: ['demo'],
      handlerId: 'en-demo',
      usedLoadableComponentKeys: ['Demo'],
      selectedComponentEntries: [
        createLoadableComponentEntry({
          key: 'Demo',
          componentImport: {
            source: '@demo/pkg',
            kind: 'named',
            importedName: 'Demo'
          },
          metadata: {
            runtimeTraits: ['selection']
          }
        })
      ],
      renderConfig: {
        pageFilePath: '/repo/pages/_handlers/en/demo.tsx',
        runtimeHandlerFactoryImport: `${TEST_PRIMARY_FACTORY_IMPORT}/selection`,
        baseStaticPropsImport: TEST_STATIC_PROPS_IMPORT,
        routeBasePath: '/content',
        emitFormat: 'ts'
      }
    }).pageSource;

    expect(defaultFactorySource).toMatch(
      /from ["']@next-slug-splitter-test\/factory\/none["'];/
    );
    expect(defaultFactorySource).toContain(
      `import('${TEST_STATIC_PROPS_IMPORT}')`
    );
    expect(packageFactorySource).toMatch(
      /from ["']test-route-handlers\/primary\/factory\/selection["'];/
    );
  });

  it('groups named component imports from the same source into one declaration', () => {
    const { pageSource } = renderRouteHandlerModules({
      locale: 'en',
      slugArray: ['content', 'concepts'],
      handlerId: 'en-content-concepts',
      usedLoadableComponentKeys: [
        'CustomComponentOne',
        'CustomComponentTwo',
        'CustomComponentThree'
      ],
      selectedComponentEntries: [
        createLoadableComponentEntry({
          key: 'CustomComponentOne',
          componentImport: {
            source: '@next-slug-splitter-test/content-components',
            kind: 'named',
            importedName: 'CustomComponentOne'
          }
        }),
        createLoadableComponentEntry({
          key: 'CustomComponentTwo',
          componentImport: {
            source: '@next-slug-splitter-test/content-components',
            kind: 'named',
            importedName: 'CustomComponentTwo'
          }
        }),
        createLoadableComponentEntry({
          key: 'CustomComponentThree',
          componentImport: {
            source: '@next-slug-splitter-test/content-components',
            kind: 'named',
            importedName: 'CustomComponentThree'
          }
        })
      ],
      renderConfig: {
        pageFilePath: '/repo/pages/_handlers/en/content/concepts.tsx',
        runtimeHandlerFactoryImport: '../../../../../test-runtime/factory/none',
        baseStaticPropsImport: '../../../[...entry]',
        routeBasePath: '/content',
        emitFormat: 'ts'
      }
    });

    expect(pageSource).toContain(
      "import {\n  CustomComponentOne,\n  CustomComponentThree,\n  CustomComponentTwo\n} from '@next-slug-splitter-test/content-components';"
    );
    expect(
      pageSource.match(
        /from ['"]@next-slug-splitter-test\/content-components['"]/g
      )
        ?.length ?? 0
    ).toBe(1);
  });

  it('rewrites absolute component sources relative to the generated handler file', () => {
    const { pageSource } = renderRouteHandlerModules({
      locale: 'en',
      slugArray: ['content', 'concepts'],
      handlerId: 'en-content-concepts',
      usedLoadableComponentKeys: ['CustomComponent'],
      selectedComponentEntries: [
        createLoadableComponentEntry({
          key: 'CustomComponent',
          componentImport: {
            source: '/repo/packages/content/mdx/src/route-handler-components.ts',
            kind: 'named',
            importedName: 'CustomComponent'
          }
        })
      ],
      renderConfig: {
        pageFilePath: '/repo/pages/docs/_handlers/content/concepts/en.tsx',
        runtimeHandlerFactoryImport: '../../../../../test-runtime/factory/none',
        baseStaticPropsImport: '../../../[...entry]',
        routeBasePath: '/content',
        emitFormat: 'ts'
      }
    });

    expect(pageSource).toContain(
      "from '../../../../../packages/content/mdx/src/route-handler-components';"
    );
  });

  it('preserves catch-all base static props import for nested handler paths', async () => {
    await withTempDir('next-slug-splitter-', async rootDir => {
      const paths = createTestPaths(rootDir);
      const contentHandlerModuleInput = createContentHandlerModuleInput(rootDir);
      const componentEntry = createLoadableComponentEntry({
        key: 'NestedCustomComponent',
        componentImport: {
          source: '@next-slug-splitter-test/content-components',
          kind: 'named',
          importedName: 'NestedCustomComponent'
        }
      });

      await emitRouteHandlerPages({
        paths,
        heavyRoutes: [
          createPlannedHeavyRoute({
            locale: 'de',
            slugArray: ['nested', 'example'],
            handlerId: 'de-nested-example',
            handlerRelativePath: 'nested/example/de',
            usedLoadableComponentKeys: ['NestedCustomComponent'],
            factoryVariant: 'none',
            componentEntries: [componentEntry]
          })
        ],
        emitFormat: 'ts',
        runtimeHandlerFactoryImportBase:
          contentHandlerModuleInput.runtimeHandlerFactoryImportBase,
        baseStaticPropsImport: contentHandlerModuleInput.baseStaticPropsImport,
        routeBasePath: contentHandlerModuleInput.routeBasePath
      });

      const pageSource = await readFile(
        path.join(paths.handlersDir, 'nested', 'example', 'de.tsx'),
        'utf8'
      );

      expect(pageSource).toContain("() => import('../../../[...entry]')");
    });
  });
});
