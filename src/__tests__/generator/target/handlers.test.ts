import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { emitRouteHandlerPages } from '../../../generator/pages/target/handlers';
import { renderRouteHandlerModules } from '../../../generator/pages/protocol/render-modules';
import { absoluteModule, packageModule } from '../../../module-reference';
import {
  createContentHandlerModuleInput,
  createLoadableComponentEntry,
  createPlannedHeavyRoute,
  createTestPaths
} from '../../helpers/builders';
import {
  TEST_PRIMARY_FACTORY_IMPORT,
  TEST_STATIC_PROPS_IMPORT
} from '../../helpers/fixtures';
import { withTempDir } from '../../helpers/temp-dir';

import type { LoadableComponentEntry } from '../../../core/types';

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const createRuntimeTraitsBlock = (trait: string): string =>
  `runtimeTraits: [
        '${trait}'
      ]`;

const wrapperRuntimeTraitsBlock = createRuntimeTraitsBlock('wrapper');
const selectionRuntimeTraitsBlock = createRuntimeTraitsBlock('selection');

describe('generator handlers', () => {
  it('emits static handler page module with inline runtime traits', () => {
    const selectedComponentEntries: Array<LoadableComponentEntry> = [
      createLoadableComponentEntry({
        key: 'WrapperComponent',
        componentImport: {
          source: packageModule('@next-slug-splitter-test/components'),
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
          source: packageModule('@next-slug-splitter-test/components'),
          kind: 'named',
          importedName: 'SelectionComponent'
        },
        metadata: {
          runtimeTraits: ['selection']
        }
      })
    ];

    const pageSource = renderRouteHandlerModules({
      locale: 'de',
      slugArray: ['nested', 'example'],
      handlerId: 'de-nested-example',
      usedLoadableComponentKeys: ['WrapperComponent', 'SelectionComponent'],
      selectedComponentEntries,
      renderConfig: {
        pageFilePath: '/repo/pages/generated-handlers/de/nested/example.tsx',
        runtimeHandlerFactoryImport:
          '../../../../../../test-runtime/factory/selection',
        routeContract: '../../../../[...entry]',
        routeBasePath: '/content',
        emitFormat: 'ts',
        handlerRouteParam: { name: 'entry', kind: 'catch-all' }
      }
    });

    expect(pageSource).toContain("from 'next-slug-splitter/next/handler';");
    expect(pageSource).toContain(
      "from '../../../../../../test-runtime/factory/selection';"
    );
    expect(pageSource).toContain(wrapperRuntimeTraitsBlock);
    expect(pageSource).toContain(selectionRuntimeTraitsBlock);
    expect(pageSource).toContain("() => import('../../../../[...entry]')");
    expect(pageSource).toContain('const HandlerPage = createHandlerPage({');
    expect(pageSource).toContain(
      'export const getStaticProps = createHandlerGetStaticProps('
    );
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
            source: packageModule('@demo/pkg'),
            kind: 'named',
            importedName: 'Demo'
          }
        })
      ],
      renderConfig: {
        pageFilePath: '/repo/pages/generated-handlers/en/demo.tsx',
        runtimeHandlerFactoryImport: '@next-slug-splitter-test/factory/none',
        routeContract: TEST_STATIC_PROPS_IMPORT,
        routeBasePath: '/content',
        emitFormat: 'ts',
        handlerRouteParam: { name: 'entry', kind: 'catch-all' }
      }
    });

    const packageFactorySource = renderRouteHandlerModules({
      locale: 'en',
      slugArray: ['demo'],
      handlerId: 'en-demo',
      usedLoadableComponentKeys: ['Demo'],
      selectedComponentEntries: [
        createLoadableComponentEntry({
          key: 'Demo',
          componentImport: {
            source: packageModule('@demo/pkg'),
            kind: 'named',
            importedName: 'Demo'
          },
          metadata: {
            runtimeTraits: ['selection']
          }
        })
      ],
      renderConfig: {
        pageFilePath: '/repo/pages/generated-handlers/en/demo.tsx',
        runtimeHandlerFactoryImport: `${TEST_PRIMARY_FACTORY_IMPORT}/selection`,
        routeContract: TEST_STATIC_PROPS_IMPORT,
        routeBasePath: '/content',
        emitFormat: 'ts',
        handlerRouteParam: { name: 'entry', kind: 'catch-all' }
      }
    });

    expect(defaultFactorySource).toContain(
      "from 'next-slug-splitter/next/handler';"
    );
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
    const pageSource = renderRouteHandlerModules({
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
            source: packageModule(
              '@next-slug-splitter-test/content-components'
            ),
            kind: 'named',
            importedName: 'CustomComponentOne'
          }
        }),
        createLoadableComponentEntry({
          key: 'CustomComponentTwo',
          componentImport: {
            source: packageModule(
              '@next-slug-splitter-test/content-components'
            ),
            kind: 'named',
            importedName: 'CustomComponentTwo'
          }
        }),
        createLoadableComponentEntry({
          key: 'CustomComponentThree',
          componentImport: {
            source: packageModule(
              '@next-slug-splitter-test/content-components'
            ),
            kind: 'named',
            importedName: 'CustomComponentThree'
          }
        })
      ],
      renderConfig: {
        pageFilePath: '/repo/pages/generated-handlers/en/content/concepts.tsx',
        runtimeHandlerFactoryImport: '../../../../../test-runtime/factory/none',
        routeContract: '../../../[...entry]',
        routeBasePath: '/content',
        emitFormat: 'ts',
        handlerRouteParam: { name: 'entry', kind: 'catch-all' }
      }
    });

    expect(pageSource).toContain(
      "import {\n  CustomComponentOne,\n  CustomComponentThree,\n  CustomComponentTwo\n} from '@next-slug-splitter-test/content-components';"
    );
    expect(
      pageSource.match(
        /from ['"]@next-slug-splitter-test\/content-components['"]/g
      )?.length ?? 0
    ).toBe(1);
  });

  it('emits inline metadata fields alongside the component entry', () => {
    const pageSource = renderRouteHandlerModules({
      locale: 'en',
      slugArray: ['content', 'selection'],
      handlerId: 'en-content-selection',
      usedLoadableComponentKeys: ['SelectionComponent'],
      selectedComponentEntries: [
        createLoadableComponentEntry({
          key: 'SelectionComponent',
          componentImport: {
            source: packageModule(
              '@next-slug-splitter-test/content-components'
            ),
            kind: 'named',
            importedName: 'SelectionComponent'
          },
          metadata: {
            runtimeTraits: ['selection']
          }
        })
      ],
      renderConfig: {
        pageFilePath: '/repo/pages/generated-handlers/en/content/selection.tsx',
        runtimeHandlerFactoryImport:
          '../../../../../test-runtime/factory/selection',
        routeContract: '../../../[...entry]',
        routeBasePath: '/content',
        emitFormat: 'ts',
        handlerRouteParam: { name: 'entry', kind: 'catch-all' }
      }
    });

    expect(pageSource).toContain(
      "import { SelectionComponent } from '@next-slug-splitter-test/content-components';"
    );
    expect(pageSource).toContain(selectionRuntimeTraitsBlock);
    expect(pageSource).not.toContain('createLoadableRegistrySubset');
    expect(pageSource).not.toContain('SelectionComponentMetadata');

    const componentIndex = pageSource.indexOf('component: SelectionComponent');
    const inlineMetadataIndex = pageSource.indexOf(selectionRuntimeTraitsBlock);

    expect(componentIndex).toBeGreaterThan(-1);
    expect(inlineMetadataIndex).toBeGreaterThan(componentIndex);
  });

  it('emits route-level factory bindings unchanged into createHandlerPage', () => {
    const pageSource = renderRouteHandlerModules({
      locale: 'en',
      slugArray: ['content', 'selection'],
      handlerId: 'en-content-selection',
      usedLoadableComponentKeys: ['SelectionComponent'],
      factoryBindings: {
        loadableRuntime: {
          source: packageModule('@next-slug-splitter-test/runtime'),
          kind: 'default',
          importedName: 'loadableRuntime'
        },
        runtimeEnhancers: [
          {
            source: packageModule('@next-slug-splitter-test/runtime-wrapper'),
            kind: 'named',
            importedName: 'wrapperEnhancer'
          },
          {
            source: packageModule('@next-slug-splitter-test/runtime-selection'),
            kind: 'named',
            importedName: 'selectionEnhancer'
          }
        ]
      },
      selectedComponentEntries: [
        createLoadableComponentEntry({
          key: 'SelectionComponent',
          componentImport: {
            source: packageModule(
              '@next-slug-splitter-test/content-components'
            ),
            kind: 'named',
            importedName: 'SelectionComponent'
          }
        })
      ],
      renderConfig: {
        pageFilePath: '/repo/pages/generated-handlers/en/content/selection.tsx',
        runtimeHandlerFactoryImport:
          '../../../../../test-runtime/factory/selection',
        routeContract: '../../../[...entry]',
        routeBasePath: '/content',
        emitFormat: 'ts',
        handlerRouteParam: { name: 'entry', kind: 'catch-all' }
      }
    });

    expect(pageSource).toContain("from '@next-slug-splitter-test/runtime';");
    expect(pageSource).toContain(
      "import { wrapperEnhancer } from '@next-slug-splitter-test/runtime-wrapper';"
    );
    expect(pageSource).toContain(
      "import { selectionEnhancer } from '@next-slug-splitter-test/runtime-selection';"
    );
    expect(pageSource).toContain('loadableRuntime: runtime');
    expect(pageSource).toContain(
      [
        'runtimeEnhancers: [',
        '    wrapperEnhancer,',
        '    selectionEnhancer',
        '  ]'
      ].join('\n')
    );
  });

  it('rewrites absolute component sources relative to the generated handler file', () => {
    const pageSource = renderRouteHandlerModules({
      locale: 'en',
      slugArray: ['content', 'concepts'],
      handlerId: 'en-content-concepts',
      usedLoadableComponentKeys: ['CustomComponent'],
      selectedComponentEntries: [
        createLoadableComponentEntry({
          key: 'CustomComponent',
          componentImport: {
            source: absoluteModule(
              '/repo/packages/content/mdx/src/route-handler-components.ts'
            ),
            kind: 'named',
            importedName: 'CustomComponent'
          }
        })
      ],
      renderConfig: {
        pageFilePath:
          '/repo/pages/docs/generated-handlers/content/concepts/en.tsx',
        runtimeHandlerFactoryImport: '../../../../../test-runtime/factory/none',
        routeContract: '../../../[...entry]',
        routeBasePath: '/content',
        emitFormat: 'ts',
        handlerRouteParam: { name: 'entry', kind: 'catch-all' }
      }
    });

    expect(pageSource).toContain(
      "from '../../../../../packages/content/mdx/src/route-handler-components';"
    );
  });

  it('preserves catch-all base static props import for nested handler paths', async () => {
    await withTempDir('next-slug-splitter-', async rootDir => {
      const paths = createTestPaths(rootDir);
      const contentHandlerModuleInput =
        createContentHandlerModuleInput(rootDir);
      const componentEntry = createLoadableComponentEntry({
        key: 'NestedCustomComponent',
        componentImport: {
          source: packageModule('@next-slug-splitter-test/content-components'),
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
            factoryImport: packageModule('none'),
            componentEntries: [componentEntry]
          })
        ],
        emitFormat: 'ts',
        routeContract: contentHandlerModuleInput.routeContract,
        handlerRouteParam: contentHandlerModuleInput.handlerRouteParam,
        routeBasePath: contentHandlerModuleInput.routeBasePath
      });

      const pageSource = await readFile(
        path.join(paths.generatedDir, 'nested', 'example', 'de.tsx'),
        'utf8'
      );

      expect(pageSource).toContain("() => import('../../../[...entry]')");
    });
  });

  it('rebuilds the handler directory from the current heavy-route set', async () => {
    await withTempDir('next-slug-splitter-', async rootDir => {
      const paths = createTestPaths(rootDir);
      const contentHandlerModuleInput =
        createContentHandlerModuleInput(rootDir);

      const unchangedRoute = createPlannedHeavyRoute({
        locale: 'en',
        slugArray: ['stable'],
        handlerId: 'en-stable',
        handlerRelativePath: 'stable/en',
        usedLoadableComponentKeys: ['StableComponent'],
        factoryImport: packageModule('none'),
        componentEntries: [
          createLoadableComponentEntry({
            key: 'StableComponent',
            componentImport: {
              source: packageModule(
                '@next-slug-splitter-test/content-components'
              ),
              kind: 'named',
              importedName: 'StableComponent'
            }
          })
        ]
      });
      const changedRouteInitial = createPlannedHeavyRoute({
        locale: 'en',
        slugArray: ['changed'],
        handlerId: 'en-changed',
        handlerRelativePath: 'changed/en',
        usedLoadableComponentKeys: ['ChangedComponent'],
        factoryImport: packageModule('none'),
        componentEntries: [
          createLoadableComponentEntry({
            key: 'ChangedComponent',
            componentImport: {
              source: packageModule(
                '@next-slug-splitter-test/content-components'
              ),
              kind: 'named',
              importedName: 'ChangedComponent'
            }
          })
        ]
      });
      const staleRoute = createPlannedHeavyRoute({
        locale: 'en',
        slugArray: ['stale'],
        handlerId: 'en-stale',
        handlerRelativePath: 'stale/en',
        usedLoadableComponentKeys: ['StaleComponent'],
        factoryImport: packageModule('none'),
        componentEntries: [
          createLoadableComponentEntry({
            key: 'StaleComponent',
            componentImport: {
              source: packageModule(
                '@next-slug-splitter-test/content-components'
              ),
              kind: 'named',
              importedName: 'StaleComponent'
            }
          })
        ]
      });

      await emitRouteHandlerPages({
        paths,
        heavyRoutes: [unchangedRoute, changedRouteInitial, staleRoute],
        emitFormat: 'ts',
        routeContract: contentHandlerModuleInput.routeContract,
        handlerRouteParam: contentHandlerModuleInput.handlerRouteParam,
        routeBasePath: contentHandlerModuleInput.routeBasePath
      });

      const unchangedPath = path.join(paths.generatedDir, 'stable', 'en.tsx');
      const changedPath = path.join(paths.generatedDir, 'changed', 'en.tsx');
      const stalePath = path.join(paths.generatedDir, 'stale', 'en.tsx');
      const unchangedSourceBefore = await readFile(unchangedPath, 'utf8');
      const changedSourceBefore = await readFile(changedPath, 'utf8');

      await new Promise(resolve => setTimeout(resolve, 25));

      const changedRouteUpdated = createPlannedHeavyRoute({
        ...changedRouteInitial,
        factoryImport: packageModule('selection'),
        componentEntries: [
          createLoadableComponentEntry({
            key: 'ChangedComponent',
            componentImport: {
              source: packageModule(
                '@next-slug-splitter-test/content-components'
              ),
              kind: 'named',
              importedName: 'ChangedComponent'
            },
            metadata: {
              runtimeTraits: ['selection']
            }
          })
        ]
      });

      await emitRouteHandlerPages({
        paths,
        heavyRoutes: [unchangedRoute, changedRouteUpdated],
        emitFormat: 'ts',
        routeContract: contentHandlerModuleInput.routeContract,
        handlerRouteParam: contentHandlerModuleInput.handlerRouteParam,
        routeBasePath: contentHandlerModuleInput.routeBasePath
      });

      const unchangedSourceAfter = await readFile(unchangedPath, 'utf8');
      const changedSourceAfter = await readFile(changedPath, 'utf8');

      expect(unchangedSourceAfter).toBe(unchangedSourceBefore);
      expect(changedSourceAfter).not.toBe(changedSourceBefore);
      expect(changedSourceAfter).toContain("from 'selection'");
      expect(await fileExists(stalePath)).toBe(false);
    });
  });
});
