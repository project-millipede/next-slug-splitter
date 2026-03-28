import type { PathLike } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, test, vi } from 'vitest';

const existsSyncMock = vi.hoisted(() => vi.fn<(filePath: PathLike) => boolean>());
const resolveModuleReferenceToFilePathMock = vi.hoisted(() =>
  vi.fn<(rootDir: string, reference: { kind: string; path?: string; specifier?: string }) => string>()
);

vi.mock(import('node:fs'), async importOriginal => {
  const actual = await importOriginal();

  return {
    ...actual,
    existsSync: existsSyncMock as typeof actual.existsSync
  };
});

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
import {
  DEFAULT_NEXT_CONFIG_FILENAMES,
  findNextConfigPath
} from '../../../next/config/find-next-config-path';
import { resolveRouteHandlersAppConfig } from '../../../next/config/app';
import { resolveNormalizedRouteHandlersTargetsFromAppConfig } from '../../../next/config/resolve-configs';
import { normalizeRouteHandlersTargetOptions } from '../../../next/config/resolve-target';
import { resolveRouteHandlerPreparations } from '../../../next/config/app';
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

import type { RouteHandlersConfig } from '../../../next/types';

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
    existsSyncMock.mockReset();
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

  test('exposes stable default Next config filenames', () => {
    expect(DEFAULT_NEXT_CONFIG_FILENAMES).toEqual([
      'next.config.ts',
      'next.config.js',
      'next.config.mjs',
      'next.config.cjs'
    ]);
  });

  describe('findNextConfigPath', () => {
    type Scenario = {
      id: string;
      description: string;
      existingFiles: Array<string>;
      expected: string | undefined;
    };

    const scenarios: ReadonlyArray<Scenario> = [
      {
        id: 'First-Supported',
        description: 'returns the first supported config filename that exists',
        existingFiles: [
          path.join(TEST_APP.rootDir, 'next.config.js'),
          path.join(TEST_APP.rootDir, 'next.config.mjs')
        ],
        expected: path.join(TEST_APP.rootDir, 'next.config.js')
      },
      {
        id: 'No-Match',
        description: 'returns undefined when no supported default config exists',
        existingFiles: [],
        expected: undefined
      }
    ];

    test.for(scenarios)('[$id] $description', ({ existingFiles, expected }) => {
      existsSyncMock.mockImplementation(filePath =>
        existingFiles.includes(String(filePath))
      );

      expect(findNextConfigPath(TEST_APP.rootDir)).toBe(expected);
    });
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
    test('defaults development routing policy to proxy and allows an explicit rewrite override', () => {
      const defaultResolvedAppConfig = resolveRouteHandlersAppConfig({
        rootDir: TEST_TMP_APP.rootDir,
        routeHandlersConfig: TEST_TMP_ROUTE_HANDLERS_CONFIG
      });
      const overrideResolvedAppConfig = resolveRouteHandlersAppConfig({
        rootDir: TEST_TMP_APP.rootDir,
        routeHandlersConfig: TEST_TMP_REWRITE_ROUTE_HANDLERS_CONFIG
      });

      expect(defaultResolvedAppConfig.routing).toEqual({
        development: 'proxy'
      });
      expect(overrideResolvedAppConfig.routing).toEqual({
        development: 'rewrites'
      });
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
        normalizeRouteHandlersTargetOptions(
          TEST_RESOLVED_APP_CONFIG,
          routeHandlersConfig
        ).mdxCompileOptions
      ).toEqual({
        remarkPlugins: [testRemarkPlugin],
        recmaPlugins: [testRecmaPlugin]
      });
    });

    test('rejects invalid mdxCompileOptions plugin lists', () => {
      expect(() =>
        normalizeRouteHandlersTargetOptions(
          TEST_RESOLVED_APP_CONFIG,
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
