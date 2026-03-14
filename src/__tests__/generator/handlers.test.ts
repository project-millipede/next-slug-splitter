import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createRuntimeTraitVariantResolver } from '../../core/runtime-variants';
import { emitRouteHandlerPages } from '../../generator/handlers';
import {
  buildHandlerNestedDependencyMap,
  renderRouteHandlerModules
} from '../../generator/render-modules';
import {
  createContentHandlerModuleInput,
  createHeavyRoute,
  createRegistryEntry,
  createTestPaths
} from '../helpers/builders';
import { TEST_PRIMARY_FACTORY_IMPORT, TEST_STATIC_PROPS_IMPORT } from '../helpers/fixtures';
import { withTempDir } from '../helpers/temp-dir';

import type { RegistryEntry } from '../../core/types';

const resolveHandlerFactoryVariant = createRuntimeTraitVariantResolver({
  defaultVariant: 'none',
  rules: [
    {
      trait: 'selection',
      variant: 'selection'
    },
    {
      trait: 'wrapper',
      variant: 'wrapper'
    }
  ]
});

describe('generator handlers', () => {
  it('emits static handler page module with inline runtime traits', () => {
    const selectedRegistryEntries: Array<RegistryEntry> = [
      createRegistryEntry({
        key: 'WrapperComponent',
        componentImport: {
          source: '@next-slug-splitter-test/components',
          kind: 'named',
          importedName: 'WrapperComponent'
        },
        runtimeTraits: ['wrapper']
      }),
      createRegistryEntry({
        key: 'SelectionComponent',
        componentImport: {
          source: '@next-slug-splitter-test/components',
          kind: 'named',
          importedName: 'SelectionComponent'
        },
        runtimeTraits: ['selection']
      })
    ];

    const { pageSource } = renderRouteHandlerModules({
      locale: 'de',
      slugArray: ['nested', 'example'],
      handlerId: 'de-nested-example',
      usedLoadableComponentKeys: ['WrapperComponent', 'SelectionComponent'],
      selectedRegistryEntries,
      nestedDependencyMap: {
        SelectionComponent: ['NestedCustomComponent']
      },
      renderConfig: {
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
    expect(pageSource).toContain("runtimeTraits: ['wrapper']");
    expect(pageSource).toContain("runtimeTraits: ['selection']");
    expect(pageSource).toContain('nestedExpansionMap: NESTED_DEPENDENCY_MAP');
    expect(pageSource).toContain("() => import('../../../../[...entry]')");
    expect(pageSource).toContain('const HandlerPage = createHandlerPage({');
  });

  it('supports custom and package factory base imports', () => {
    const defaultFactorySource = renderRouteHandlerModules({
      locale: 'en',
      slugArray: ['demo'],
      handlerId: 'en-demo',
      usedLoadableComponentKeys: ['Demo'],
      selectedRegistryEntries: [
        createRegistryEntry({
          key: 'Demo',
          componentImport: {
            source: '@demo/pkg',
            kind: 'named',
            importedName: 'Demo'
          }
        })
      ],
      nestedDependencyMap: {},
      renderConfig: {
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
      selectedRegistryEntries: [
        createRegistryEntry({
          key: 'Demo',
          componentImport: {
            source: '@demo/pkg',
            kind: 'named',
            importedName: 'Demo'
          },
          runtimeTraits: ['selection']
        })
      ],
      nestedDependencyMap: {},
      renderConfig: {
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
      selectedRegistryEntries: [
        createRegistryEntry({
          key: 'CustomComponentOne',
          componentImport: {
            source: '@next-slug-splitter-test/content-components',
            kind: 'named',
            importedName: 'CustomComponentOne'
          }
        }),
        createRegistryEntry({
          key: 'CustomComponentTwo',
          componentImport: {
            source: '@next-slug-splitter-test/content-components',
            kind: 'named',
            importedName: 'CustomComponentTwo'
          }
        }),
        createRegistryEntry({
          key: 'CustomComponentThree',
          componentImport: {
            source: '@next-slug-splitter-test/content-components',
            kind: 'named',
            importedName: 'CustomComponentThree'
          }
        })
      ],
      nestedDependencyMap: {},
      renderConfig: {
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

  it('builds handler-specific nested dependency map', () => {
    const nestedDependencyMap = buildHandlerNestedDependencyMap({
      handlerLoadableKeys: [
        'CustomComponent',
        'SelectionComponent',
        'NestedCustomComponent'
      ],
      nestedDependencyMap: {
        SelectionComponent: ['NestedCustomComponent'],
        WrapperComponent: ['NestedCustomComponent', 'SupportingParagraph']
      }
    });

    expect(nestedDependencyMap).toEqual({
      SelectionComponent: ['NestedCustomComponent']
    });
  });

  it('preserves catch-all base static props import for nested handler paths', async () => {
    await withTempDir('next-slug-splitter-', async rootDir => {
      const paths = createTestPaths(rootDir);
      const contentHandlerModuleInput = createContentHandlerModuleInput(rootDir);
      const registryEntry = createRegistryEntry({
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
          createHeavyRoute({
            locale: 'de',
            slugArray: ['nested', 'example'],
            handlerId: 'de-nested-example',
            handlerRelativePath: 'nested/example/de',
            usedLoadableComponentKeys: ['NestedCustomComponent']
          })
        ],
        registry: {
          entriesByKey: new Map([[registryEntry.key, registryEntry]]),
          loadableKeys: new Set([registryEntry.key]),
          nestedDependencyMap: {}
        },
        nestedDependencyMap: {},
        emitFormat: 'ts',
        resolveHandlerFactoryVariant,
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
