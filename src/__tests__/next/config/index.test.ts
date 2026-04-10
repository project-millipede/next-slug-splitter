import path from 'node:path';

import { beforeEach, describe, expect, test, vi } from 'vitest';

const resolveModuleReferenceToFilePathMock = vi.hoisted(() =>
  vi.fn<(rootDir: string, reference: { kind: string; path?: string; specifier?: string }) => string>()
);

vi.mock(import('../../../module-reference'), async importOriginal => {
  const actual = await importOriginal<typeof import('../../../module-reference')>();

  return {
    ...actual,
    resolveModuleReferenceToFilePath: resolveModuleReferenceToFilePathMock
  };
});

import {
  packageModule,
  relativeModule
} from '../../../module-reference';
import { createCatchAllRouteHandlersPreset } from '../../../next/config/index';
import { resolveRouteHandlersAppConfig } from '../../../next/shared/config/app';
import { resolveNormalizedRouteHandlersTargetsFromAppConfig } from '../../../next/shared/config/resolve-configs';
import {
  normalizeRouteHandlersTargetOptions,
  normalizeRouteHandlersTargetRuntimeAttachments
} from '../../../next/shared/config/resolve-target';
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

function testRemarkPlugin() {}
function testRecmaPlugin() {}

const TEST_APP = {
  rootDir: '/repo/app'
} as const;

const TEST_TMP_APP = {
  rootDir: '/tmp/app'
} as const;

const TEST_ROUTE_HANDLERS_CONFIG = {
  app: TEST_APP
} as const;

const TEST_TMP_ROUTE_HANDLERS_CONFIG = {
  app: TEST_TMP_APP
} as const;

const TEST_TMP_REWRITE_ROUTE_HANDLERS_CONFIG = {
  app: {
    ...TEST_TMP_APP,
    routing: {
      development: 'rewrites' as const
    }
  }
};

const TEST_TMP_PREWARM_ROUTE_HANDLERS_CONFIG = {
  app: {
    ...TEST_TMP_APP,
    routing: {
      development: 'proxy' as const,
      workerPrewarm: 'instrumentation' as const
    }
  }
};

const TEST_TMP_REWRITE_PREWARM_ROUTE_HANDLERS_CONFIG = {
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

const createResolvedAppConfig = ({
  rootDir
}: {
  rootDir: string;
}) =>
  resolveRouteHandlersAppConfig({
    rootDir,
    routeHandlersConfig: {
      app: {
        rootDir
      }
    }
  });

const TEST_RESOLVED_APP_CONFIG = createResolvedAppConfig(TEST_APP);

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
        contentPagesDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
        handlerBinding: createTestHandlerBinding()
      });

      expect(routeHandlersConfig.baseStaticPropsImport).toEqual(
        relativeModule('pages/content/[...entry]')
      );
      expect(routeHandlersConfig.targetId).toBe(TEST_PRIMARY_ROUTE_SEGMENT);
      expect(routeHandlersConfig.routeBasePath).toBe('/content');
      expect(routeHandlersConfig.paths?.contentPagesDir).toBe(
        TEST_PRIMARY_CONTENT_PAGES_DIR
      );
      expect(routeHandlersConfig.paths?.handlersDir).toBe(
        path.join('pages', 'content', '_handlers')
      );
    });

    test('supports single-segment route params via handlerRouteParam', () => {
      const routeHandlersConfig = createCatchAllRouteHandlersPreset({
        routeSegment: TEST_SECONDARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_SINGLE_ROUTE_PARAM_NAME,
          kind: 'single'
        },
        contentPagesDir: TEST_SECONDARY_CONTENT_PAGES_DIR,
        handlerBinding: createTestHandlerBinding({
          processorImport: packageModule(TEST_SECONDARY_PROCESSOR_IMPORT)
        })
      });

      expect(routeHandlersConfig.baseStaticPropsImport).toEqual(
        relativeModule('pages/secondary/[item]')
      );
      expect(routeHandlersConfig.targetId).toBe(TEST_SECONDARY_ROUTE_SEGMENT);
      expect(routeHandlersConfig.routeBasePath).toBe('/secondary');
      expect(routeHandlersConfig.paths?.handlersDir).toBe(
        path.join('pages', 'secondary', '_handlers')
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
    type PrepareShape = NonNullable<RouteHandlersConfig['app']>['prepare'];

    type Scenario = {
      id: string;
      description: string;
      prepare?: PrepareShape;
      expected: Array<{ tsconfigPath: string }>;
    };

    const firstTsconfigPath = path.join(TEST_APP.rootDir, 'tsconfig.first.json');
    const secondTsconfigPath = path.join(TEST_APP.rootDir, 'tsconfig.second.json');
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
      ).toThrowError(
        'routeHandlersConfig.app.prepare[0] must be an object.'
      );
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
        contentPagesDir: TEST_SECONDARY_CONTENT_PAGES_DIR,
        handlerBinding: createTestHandlerBinding({
          processorImport: packageModule(TEST_SECONDARY_PROCESSOR_IMPORT)
        })
      });

      const normalizedOptions = normalizeRouteHandlersTargetOptions(
        TEST_RESOLVED_APP_CONFIG,
        routeHandlersConfig
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

      expect(
        normalizeRouteHandlersTargetRuntimeAttachments(
          routeHandlersConfig
        ).mdxCompileOptions
      ).toEqual({
        remarkPlugins: [testRemarkPlugin],
        recmaPlugins: [testRecmaPlugin]
      });
    });

    test('rejects invalid mdxCompileOptions plugin lists', () => {
      expect(() =>
        normalizeRouteHandlersTargetRuntimeAttachments(
          {
            app: createAppConfig(TEST_APP.rootDir),
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
        )
      ).toThrow(
        '[next-slug-splitter] mdxCompileOptions.remarkPlugins must be an array.'
      );
    });
  });

  describe('resolveNormalizedRouteHandlersTargetsFromAppConfig', () => {
    test('resolves multi-target configs via targets array', () => {
      const routeHandlersConfig: RouteHandlersConfig = {
        app: createAppConfig(TEST_APP.rootDir),
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
              processorImport: packageModule(TEST_SECONDARY_PROCESSOR_IMPORT)
            })
          })
        ]
      };

      const normalizedTargets = resolveNormalizedRouteHandlersTargetsFromAppConfig(
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
            app: createAppConfig(TEST_APP.rootDir),
            targets: [
              createCatchAllRouteHandlersPreset({
                routeSegment: 'docs',
                handlerRouteParam: {
                  name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
                  kind: 'catch-all'
                },
                contentPagesDir: 'content-a',
                handlerBinding: createTestHandlerBinding()
              }),
              createCatchAllRouteHandlersPreset({
                routeSegment: 'docs',
                handlerRouteParam: {
                  name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
                  kind: 'catch-all'
                },
                contentPagesDir: 'content-b',
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
