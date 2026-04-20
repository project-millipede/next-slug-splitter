import path from 'node:path';

import { beforeEach, describe, expect, test, vi } from 'vitest';

const resolveModuleReferenceToFilePathMock = vi.hoisted(() =>
  vi.fn<
    (
      rootDir: string,
      reference: { kind: string; path?: string; specifier?: string }
    ) => string
  >()
);

vi.mock(import('../../../module-reference'), async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../../module-reference')>();

  return {
    ...actual,
    resolveModuleReferenceToFilePath: resolveModuleReferenceToFilePathMock
  };
});

import { packageModule, relativeModule } from '../../../module-reference';
import {
  createCatchAllRouteHandlersPreset,
  createAppCatchAllRouteHandlersPreset
} from '../../../next/config/index';
import { resolveRouteHandlersAppConfig } from '../../../next/shared/config/app';
import {
  normalizeRouteHandlersTargetOptions,
  normalizeRouteHandlersTargetRuntimeAttachments
} from '../../../next/shared/config/resolve-target';
import { resolveNormalizedRouteHandlersTargetsFromAppConfig } from '../../../next/pages/config/resolve-configs';
import { resolveRouteHandlerPreparations } from '../../../next/shared/config/app';
import {
  TEST_CATCH_ALL_ROUTE_PARAM_NAME,
  TEST_PRIMARY_CONTENT_PAGES_DIR,
  TEST_PRIMARY_ROUTE_SEGMENT,
  TEST_SECONDARY_CONTENT_PAGES_DIR,
  TEST_SECONDARY_PROCESSOR_IMPORT,
  TEST_SECONDARY_ROUTE_SEGMENT,
  TEST_SINGLE_ROUTE_PARAM_NAME,
  createTestHandlerBinding
} from '../../helpers/fixtures';

import type { RouteHandlersConfig } from '../../../next/pages/types';
import type { RouteHandlerPreparationsInput } from '../../../next/shared/types';

function testRemarkPlugin() {}
function testRecmaPlugin() {}

const TEST_APP = {
  rootDir: '/repo/app'
} as const;

const TEST_TMP_APP = {
  rootDir: '/tmp/app'
} as const;

const TEST_ROUTE_HANDLERS_CONFIG = {
  routerKind: 'pages' as const,
  app: TEST_APP
} as const;

const TEST_TMP_ROUTE_HANDLERS_CONFIG = {
  routerKind: 'pages' as const,
  app: TEST_TMP_APP
} as const;

const TEST_TMP_REWRITE_ROUTE_HANDLERS_CONFIG = {
  routerKind: 'pages' as const,
  app: {
    ...TEST_TMP_APP,
    routing: {
      development: 'rewrites' as const
    }
  }
};

const TEST_TMP_PREWARM_ROUTE_HANDLERS_CONFIG = {
  routerKind: 'pages' as const,
  app: {
    ...TEST_TMP_APP,
    routing: {
      development: 'proxy' as const,
      workerPrewarm: 'instrumentation' as const
    }
  }
};

const TEST_TMP_REWRITE_PREWARM_ROUTE_HANDLERS_CONFIG = {
  routerKind: 'pages' as const,
  app: {
    ...TEST_TMP_APP,
    routing: {
      development: 'rewrites' as const,
      workerPrewarm: 'instrumentation' as const
    }
  }
};

const createAppConfig = (rootDir: string) => ({
  rootDir
});

const createResolvedAppConfig = ({ rootDir }: { rootDir: string }) =>
  resolveRouteHandlersAppConfig({
    rootDir,
    routeHandlersConfig: {
      routerKind: 'pages',
      app: {
        rootDir
      }
    }
  });

const TEST_RESOLVED_APP_CONFIG = createResolvedAppConfig(TEST_APP);
const TEST_PRIMARY_ROUTE_CONTRACT = relativeModule('pages/content/[...entry]');
const TEST_SECONDARY_ROUTE_CONTRACT = relativeModule('pages/secondary/[item]');
const TEST_DOCS_ROUTE_CONTRACT = relativeModule('pages/docs/[...entry]');

describe('next config helpers', () => {
  beforeEach(() => {
    resolveModuleReferenceToFilePathMock.mockReset();
    resolveModuleReferenceToFilePathMock.mockImplementation(
      (rootDir, reference) => {
        if (reference.kind === 'relative-file' && reference.path != null) {
          return path.join(rootDir, reference.path);
        }

        if (reference.kind === 'absolute-file' && reference.path != null) {
          return reference.path;
        }

        if (reference.kind === 'package' && reference.specifier != null) {
          return path.join(rootDir, 'node_modules', reference.specifier);
        }

        throw new Error('Unexpected module reference in test.');
      }
    );
  });

  describe('createCatchAllRouteHandlersPreset', () => {
    test('creates catch-all preset from route segment and root-relative paths', () => {
      const routeHandlersConfig = createCatchAllRouteHandlersPreset({
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        },
        contentDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
        routeContract: TEST_PRIMARY_ROUTE_CONTRACT,
        handlerBinding: createTestHandlerBinding()
      });

      expect(routeHandlersConfig.routeContract).toEqual(TEST_PRIMARY_ROUTE_CONTRACT);
      expect(routeHandlersConfig.targetId).toBe(TEST_PRIMARY_ROUTE_SEGMENT);
      expect(routeHandlersConfig.routeBasePath).toBe('/content');
      expect(routeHandlersConfig.contentDir).toBe(
        TEST_PRIMARY_CONTENT_PAGES_DIR
      );
      expect(routeHandlersConfig.generatedRootDir).toBe(
        path.join('pages', 'content')
      );
    });

    test('supports single-segment route params via handlerRouteParam', () => {
      const routeHandlersConfig = createCatchAllRouteHandlersPreset({
        routeSegment: TEST_SECONDARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_SINGLE_ROUTE_PARAM_NAME,
          kind: 'single'
        },
        contentDir: TEST_SECONDARY_CONTENT_PAGES_DIR,
        routeContract: TEST_SECONDARY_ROUTE_CONTRACT,
        handlerBinding: createTestHandlerBinding({
          processorImport: packageModule(TEST_SECONDARY_PROCESSOR_IMPORT)
        })
      });

      expect(routeHandlersConfig.routeContract).toEqual(
        TEST_SECONDARY_ROUTE_CONTRACT
      );
      expect(routeHandlersConfig.targetId).toBe(TEST_SECONDARY_ROUTE_SEGMENT);
      expect(routeHandlersConfig.routeBasePath).toBe('/secondary');
      expect(routeHandlersConfig.generatedRootDir).toBe(
        path.join('pages', 'secondary')
      );
    });
  });

  describe('createAppCatchAllRouteHandlersPreset', () => {
    test('creates App catch-all preset from route segment and root-relative paths', () => {
      const routeHandlersConfig = createAppCatchAllRouteHandlersPreset({
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        },
        contentDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
        routeContract: relativeModule('lib/docs-route-module'),
        handlerBinding: createTestHandlerBinding()
      });

      expect(routeHandlersConfig.routeContract).toEqual(
        relativeModule('lib/docs-route-module')
      );
      expect(routeHandlersConfig.targetId).toBe(TEST_PRIMARY_ROUTE_SEGMENT);
      expect(routeHandlersConfig.routeBasePath).toBe('/content');
      expect(routeHandlersConfig.contentDir).toBe(
        TEST_PRIMARY_CONTENT_PAGES_DIR
      );
      expect(routeHandlersConfig.generatedRootDir).toBe(
        path.join('app', 'content')
      );
    });
  });

  describe('resolveRouteHandlersAppConfig', () => {
    test('defaults routing policy to proxy + prewarm off and allows explicit overrides', () => {
      const defaultResolvedAppConfig = resolveRouteHandlersAppConfig({
        rootDir: TEST_TMP_APP.rootDir,
        routeHandlersConfig: TEST_TMP_ROUTE_HANDLERS_CONFIG
      });
      const overrideResolvedAppConfig = resolveRouteHandlersAppConfig({
        rootDir: TEST_TMP_APP.rootDir,
        routeHandlersConfig: TEST_TMP_REWRITE_ROUTE_HANDLERS_CONFIG
      });
      const prewarmResolvedAppConfig = resolveRouteHandlersAppConfig({
        rootDir: TEST_TMP_APP.rootDir,
        routeHandlersConfig: TEST_TMP_PREWARM_ROUTE_HANDLERS_CONFIG
      });
      const rewritePrewarmResolvedAppConfig = resolveRouteHandlersAppConfig({
        rootDir: TEST_TMP_APP.rootDir,
        routeHandlersConfig: TEST_TMP_REWRITE_PREWARM_ROUTE_HANDLERS_CONFIG
      });

      expect(defaultResolvedAppConfig.routing).toEqual({
        development: 'proxy',
        workerPrewarm: 'off'
      });
      expect(overrideResolvedAppConfig.routing).toEqual({
        development: 'rewrites',
        workerPrewarm: 'off'
      });
      expect(prewarmResolvedAppConfig.routing).toEqual({
        development: 'proxy',
        workerPrewarm: 'instrumentation'
      });
      expect(rewritePrewarmResolvedAppConfig.routing).toEqual({
        development: 'rewrites',
        workerPrewarm: 'instrumentation'
      });
    });

    test('rejects unsupported proxy prewarm values', () => {
      expect(() =>
        resolveRouteHandlersAppConfig({
          rootDir: TEST_TMP_APP.rootDir,
          routeHandlersConfig: {
            app: {
              ...TEST_TMP_APP,
              routing: {
                workerPrewarm: 'startup-hit'
              }
            }
          } as never
        })
      ).toThrow(
        'routeHandlersConfig.app.routing.workerPrewarm must be "off" or "instrumentation" when provided.'
      );
    });
  });

  describe('resolveRouteHandlerPreparations', () => {
    type PrepareShape = RouteHandlerPreparationsInput;

    type Scenario = {
      id: string;
      description: string;
      prepare?: PrepareShape;
      expected: Array<{ tsconfigPath: string }>;
    };

    const firstTsconfigPath = path.join(
      TEST_APP.rootDir,
      'tsconfig.first.json'
    );
    const secondTsconfigPath = path.join(
      TEST_APP.rootDir,
      'tsconfig.second.json'
    );
    const scenarios: ReadonlyArray<Scenario> = [
      {
        id: 'Omitted',
        description: 'returns an empty list when app.prepare is omitted',
        expected: []
      },
      {
        id: 'Single',
        description: 'resolves a single prepare entry to one tsconfig path',
        prepare: {
          tsconfigPath: relativeModule('tsconfig.first.json')
        },
        expected: [
          {
            tsconfigPath: firstTsconfigPath
          }
        ]
      },
      {
        id: 'Multiple',
        description: 'resolves multiple prepare entries in declared order',
        prepare: [
          {
            tsconfigPath: relativeModule('tsconfig.first.json')
          },
          {
            tsconfigPath: relativeModule('tsconfig.second.json')
          }
        ],
        expected: [
          {
            tsconfigPath: firstTsconfigPath
          },
          {
            tsconfigPath: secondTsconfigPath
          }
        ]
      }
    ];

    test.for(scenarios)('[$id] $description', ({ prepare, expected }) => {
      expect(
        resolveRouteHandlerPreparations({
          rootDir: TEST_APP.rootDir,
          routeHandlersConfig: {
            ...TEST_ROUTE_HANDLERS_CONFIG,
            app: {
              ...TEST_ROUTE_HANDLERS_CONFIG.app,
              prepare
            }
          }
        })
      ).toEqual(expected);
    });

    test('rejects invalid app.prepare shapes', () => {
      expect(() =>
        resolveRouteHandlerPreparations({
          rootDir: TEST_TMP_APP.rootDir,
          routeHandlersConfig: {
            ...TEST_TMP_ROUTE_HANDLERS_CONFIG,
            app: {
              ...TEST_TMP_ROUTE_HANDLERS_CONFIG.app,
              prepare: false
            }
          } as unknown as RouteHandlersConfig
        })
      ).toThrowError(
        'routeHandlersConfig.app.prepare must be an object or array when provided.'
      );

      expect(() =>
        resolveRouteHandlerPreparations({
          rootDir: TEST_TMP_APP.rootDir,
          routeHandlersConfig: {
            ...TEST_TMP_ROUTE_HANDLERS_CONFIG,
            app: {
              ...TEST_TMP_ROUTE_HANDLERS_CONFIG.app,
              prepare: [false]
            }
          } as unknown as RouteHandlersConfig
        })
      ).toThrowError('routeHandlersConfig.app.prepare[0] must be an object.');
    });
  });

  describe('normalizeRouteHandlersTargetOptions', () => {
    test('supports non-localized content mode via contentLocaleMode', () => {
      const routeHandlersConfig = createCatchAllRouteHandlersPreset({
        routeSegment: TEST_SECONDARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_SINGLE_ROUTE_PARAM_NAME,
          kind: 'single'
        },
        contentLocaleMode: 'default-locale',
        contentDir: TEST_SECONDARY_CONTENT_PAGES_DIR,
        routeContract: TEST_SECONDARY_ROUTE_CONTRACT,
        handlerBinding: createTestHandlerBinding({
          processorImport: packageModule(TEST_SECONDARY_PROCESSOR_IMPORT)
        })
      });

      const normalizedOptions = normalizeRouteHandlersTargetOptions(
        TEST_RESOLVED_APP_CONFIG,
        routeHandlersConfig,
        'pages'
      );

      expect(normalizedOptions.contentLocaleMode).toBe('default-locale');
      expect(normalizedOptions.routeBasePath).toBe('/secondary');
    });

    test('passes mdxCompileOptions through preset and target normalization', () => {
      const routeHandlersConfig = createCatchAllRouteHandlersPreset({
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        },
        contentDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
        routeContract: TEST_PRIMARY_ROUTE_CONTRACT,
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

      expect(
        normalizeRouteHandlersTargetRuntimeAttachments(routeHandlersConfig)
          .mdxCompileOptions
      ).toEqual({
        remarkPlugins: [testRemarkPlugin],
        recmaPlugins: [testRecmaPlugin]
      });
    });

    test('rejects invalid mdxCompileOptions plugin lists', () => {
      expect(() =>
        normalizeRouteHandlersTargetRuntimeAttachments({
          app: createAppConfig(TEST_APP.rootDir),
          ...createCatchAllRouteHandlersPreset({
            routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
            handlerRouteParam: {
              name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
              kind: 'catch-all'
            },
            contentDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
            routeContract: TEST_PRIMARY_ROUTE_CONTRACT,
            handlerBinding: createTestHandlerBinding()
          }),
          mdxCompileOptions: {
            remarkPlugins: 'not-an-array'
          }
        } as unknown as RouteHandlersConfig)
      ).toThrow(
        '[next-slug-splitter] mdxCompileOptions.remarkPlugins must be an array.'
      );

      expect(() =>
        normalizeRouteHandlersTargetRuntimeAttachments(undefined)
      ).toThrow('[next-slug-splitter] Missing routeHandlersConfig.');
    });
  });

  describe('resolveNormalizedRouteHandlersTargetsFromAppConfig', () => {
    test('resolves multi-target configs via targets array', () => {
      const routeHandlersConfig: RouteHandlersConfig = {
        routerKind: 'pages',
        app: createAppConfig(TEST_APP.rootDir),
        targets: [
          createCatchAllRouteHandlersPreset({
            routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
            handlerRouteParam: {
              name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
              kind: 'catch-all'
            },
            contentDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
            routeContract: TEST_PRIMARY_ROUTE_CONTRACT,
            handlerBinding: createTestHandlerBinding()
          }),
          createCatchAllRouteHandlersPreset({
            routeSegment: TEST_SECONDARY_ROUTE_SEGMENT,
            handlerRouteParam: {
              name: TEST_SINGLE_ROUTE_PARAM_NAME,
              kind: 'single'
            },
            contentDir: TEST_SECONDARY_CONTENT_PAGES_DIR,
            routeContract: TEST_SECONDARY_ROUTE_CONTRACT,
            handlerBinding: createTestHandlerBinding({
              processorImport: packageModule(TEST_SECONDARY_PROCESSOR_IMPORT)
            })
          })
        ]
      };

      const normalizedTargets =
        resolveNormalizedRouteHandlersTargetsFromAppConfig(
          TEST_RESOLVED_APP_CONFIG,
          routeHandlersConfig
        );

      expect(normalizedTargets).toHaveLength(2);
      const [contentTarget, secondaryTarget] = normalizedTargets;

      expect(contentTarget.options.targetId).toBe(TEST_PRIMARY_ROUTE_SEGMENT);
      expect(contentTarget.options.routeBasePath).toBe('/content');
      expect(secondaryTarget.options.targetId).toBe(
        TEST_SECONDARY_ROUTE_SEGMENT
      );
      expect(secondaryTarget.options.routeBasePath).toBe('/secondary');
      expect(secondaryTarget.options.contentLocaleMode).toBe('filename');
    });

    test('rejects duplicate normalized target ids', () => {
      expect(() =>
        resolveNormalizedRouteHandlersTargetsFromAppConfig(
          TEST_RESOLVED_APP_CONFIG,
          {
            routerKind: 'pages',
            app: createAppConfig(TEST_APP.rootDir),
            targets: [
              createCatchAllRouteHandlersPreset({
                routeSegment: 'docs',
                handlerRouteParam: {
                  name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
                  kind: 'catch-all'
                },
                contentDir: 'content-a',
                routeContract: TEST_DOCS_ROUTE_CONTRACT,
                handlerBinding: createTestHandlerBinding()
              }),
              createCatchAllRouteHandlersPreset({
                routeSegment: 'docs',
                handlerRouteParam: {
                  name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
                  kind: 'catch-all'
                },
                contentDir: 'content-b',
                routeContract: TEST_DOCS_ROUTE_CONTRACT,
                handlerBinding: createTestHandlerBinding()
              })
            ]
          }
        )
      ).toThrow(
        'routeHandlersConfig.targets contains duplicate targetId "docs".'
      );
    });
  });
});
