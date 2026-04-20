import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureRouteHandlerComponentGraphMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../../core/capture'), () => ({
  captureRouteHandlerComponentGraph: captureRouteHandlerComponentGraphMock
}));

import { createCatchAllRouteHandlersPreset } from '../../../../next/config';
import { resolveRouteHandlersConfigsFromAppConfig } from '../../../../next/pages/config/resolve-configs';
import { resolveRouteHandlersAppContext } from '../../../../next/shared/bootstrap/route-handlers-bootstrap';
import {
  resolveRouteHandlerLazyRequest,
  resolveRouteHandlerLazyResolvedTargetsFromAppConfig
} from '../../../../next/proxy/lazy/request-resolution';
import { createRouteHandlerLazySingleRouteCacheManager } from '../../../../next/proxy/lazy/single-route-cache-manager';
import { analyzeRouteHandlerLazyMatchedRoute } from '../../../../next/proxy/lazy/single-route-analysis';
import {
  TEST_CATCH_ALL_ROUTE_PARAM_NAME,
  TEST_PRIMARY_CONTENT_PAGES_DIR,
  TEST_PRIMARY_ROUTE_SEGMENT,
  createTestHandlerBinding,
  writeTestBaseStaticPropsPage,
  writeTestModule,
  writeTestRouteHandlerPackage
} from '../../../helpers/fixtures';
import { withTempDir } from '../../../helpers/temp-dir';

import type {
  ResolvedRouteHandlersConfig,
  RouteHandlersConfig,
  RouteHandlersTargetConfig
} from '../../../../next/pages/types';
import type { RouteHandlerLazyResolvedTarget } from '../../../../next/proxy/lazy/types';

const TEST_LOCALE_CONFIG = {
  locales: ['en'],
  defaultLocale: 'en'
};
const TEST_BOOTSTRAP_GENERATION_TOKEN = 'bootstrap-1';
const TEST_NEXT_BOOTSTRAP_GENERATION_TOKEN = 'bootstrap-2';

/**
 * Create a minimal captured MDX graph result for one route file.
 *
 * @param usedComponentNames - Captured component names for the route.
 * @param transitiveModulePaths - Optional non-root transitive MDX module
 * paths.
 * @returns Minimal captured graph result used by lazy analysis tests.
 */
const createCapturedRouteHandlerGraphResult = ({
  usedComponentNames,
  transitiveModulePaths = []
}: {
  usedComponentNames: Array<string>;
  transitiveModulePaths?: Array<string>;
}): {
  usedComponentNames: Array<string>;
  transitiveModulePaths: Array<string>;
} => ({
  usedComponentNames,
  transitiveModulePaths
});

const createCountedProcessorSource = (logPath: string): string =>
  [
    "import { appendFileSync } from 'node:fs';",
    `const logPath = ${JSON.stringify(logPath)};`,
    'export const routeHandlerProcessor = {',
    '  resolve({ route, capturedComponentKeys }) {',
    '    appendFileSync(logPath, `${route.filePath}\\n`);',
    '    return {',
    "      factoryImport: { kind: 'package', specifier: 'none' },",
    "      components: capturedComponentKeys.map(key => ({ key, componentImport: { source: { kind: 'package', specifier: './components' }, kind: 'named', importedName: key } }))",
    '    };',
    '  }',
    '};',
    ''
  ].join('\n');

const createSingleTargetConfig = ({
  rootDir,
  targetOverrides = {}
}: {
  rootDir: string;
  targetOverrides?: Partial<RouteHandlersTargetConfig>;
}): RouteHandlersConfig => ({
  routerKind: 'pages',
  app: {
    rootDir
  },
  ...createCatchAllRouteHandlersPreset({
    routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
    handlerRouteParam: {
      name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
      kind: 'catch-all'
    },
    contentDir: path.join(rootDir, TEST_PRIMARY_CONTENT_PAGES_DIR),
    handlerBinding: createTestHandlerBinding(),
    ...targetOverrides
  })
});

const createBootstrappedLazyAnalysisState = ({
  rootDir,
  routeHandlersConfig
}: {
  rootDir: string;
  routeHandlersConfig: RouteHandlersConfig;
}): {
  resolvedTargets: Array<RouteHandlerLazyResolvedTarget>;
  resolvedConfigsByTargetId: ReadonlyMap<string, ResolvedRouteHandlersConfig>;
  lazySingleRouteCacheManager: ReturnType<
    typeof createRouteHandlerLazySingleRouteCacheManager
  >;
} => {
  const appContext = resolveRouteHandlersAppContext(
    routeHandlersConfig,
    rootDir
  );
  const bootstrappedRouteHandlersConfig = routeHandlersConfig;
  const resolvedConfigs = resolveRouteHandlersConfigsFromAppConfig(
    appContext.appConfig,
    TEST_LOCALE_CONFIG,
    bootstrappedRouteHandlersConfig
  );

  return {
    resolvedTargets: resolveRouteHandlerLazyResolvedTargetsFromAppConfig(
      appContext.appConfig,
      TEST_LOCALE_CONFIG,
      bootstrappedRouteHandlersConfig
    ),
    lazySingleRouteCacheManager:
      createRouteHandlerLazySingleRouteCacheManager(),
    resolvedConfigsByTargetId: new Map(
      resolvedConfigs.map(resolvedConfig => [
        resolvedConfig.targetId,
        resolvedConfig
      ])
    )
  };
};

const readLogEntries = async (logPath: string): Promise<Array<string>> => {
  try {
    const raw = await readFile(logPath, 'utf8');
    return raw
      .split('\n')
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0);
  } catch {
    return [];
  }
};

describe('proxy lazy single-route analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the target is not present in the bootstrapped config map', async () => {
    const result = await analyzeRouteHandlerLazyMatchedRoute({
      targetId: 'missing-target',
      routePath: {
        filePath: '/tmp/app/content/guides/en.mdx',
        locale: 'en',
        slugArray: ['guides']
      },
      resolvedConfigsByTargetId: new Map(),
      lazySingleRouteCacheManager:
        createRouteHandlerLazySingleRouteCacheManager()
    });

    expect(result).toBeNull();
  });

  it('reuses cached Stage 1 capture for heavy routes while rerunning processor planning in memory', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-single-route-',
      async rootDir => {
        const processorLogPath = path.join(rootDir, 'processor-calls.log');
        const routeHandlersConfig = createSingleTargetConfig({
          rootDir
        });
        const routeFilePath = path.join(
          rootDir,
          TEST_PRIMARY_CONTENT_PAGES_DIR,
          'guides',
          'en.mdx'
        );

        captureRouteHandlerComponentGraphMock.mockResolvedValue(
          createCapturedRouteHandlerGraphResult({
            usedComponentNames: ['CustomComponent']
          })
        );
        await writeTestRouteHandlerPackage(rootDir);
        await writeTestBaseStaticPropsPage(rootDir, {
          routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
          handlerRouteParam: {
            name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
            kind: 'catch-all'
          }
        });
        await writeTestModule(
          path.join(
            rootDir,
            'node_modules',
            'test-route-handlers',
            'primary',
            'processor.js'
          ),
          createCountedProcessorSource(processorLogPath)
        );
        await writeTestModule(routeFilePath, '# Guides\n');
        const bootstrapState = createBootstrappedLazyAnalysisState({
          rootDir,
          routeHandlersConfig
        });

        const resolution = await resolveRouteHandlerLazyRequest(
          '/content/guides',
          bootstrapState.resolvedTargets
        );

        expect(resolution.kind).toBe('matched-route-file');
        if (resolution.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        const firstResult = await analyzeRouteHandlerLazyMatchedRoute({
          targetId: resolution.config.targetId,
          routePath: resolution.routePath,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId,
          lazySingleRouteCacheManager:
            bootstrapState.lazySingleRouteCacheManager
        });
        const secondResult = await analyzeRouteHandlerLazyMatchedRoute({
          targetId: resolution.config.targetId,
          routePath: resolution.routePath,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId,
          lazySingleRouteCacheManager:
            bootstrapState.lazySingleRouteCacheManager
        });

        expect(firstResult?.kind).toBe('heavy');
        expect(firstResult?.source).toBe('fresh');
        expect(secondResult?.kind).toBe('heavy');
        expect(secondResult?.source).toBe('cache');
        expect(await readLogEntries(processorLogPath)).toEqual([
          routeFilePath,
          routeFilePath
        ]);
        expect(captureRouteHandlerComponentGraphMock).toHaveBeenCalledTimes(1);
      }
    );
  });

  it('caches light single-route results without invoking the processor', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-single-route-',
      async rootDir => {
        const processorLogPath = path.join(rootDir, 'processor-calls.log');
        const routeHandlersConfig = createSingleTargetConfig({
          rootDir
        });
        const routeFilePath = path.join(
          rootDir,
          TEST_PRIMARY_CONTENT_PAGES_DIR,
          'guides',
          'en.mdx'
        );

        captureRouteHandlerComponentGraphMock.mockResolvedValue(
          createCapturedRouteHandlerGraphResult({
            usedComponentNames: []
          })
        );
        await writeTestRouteHandlerPackage(rootDir);
        await writeTestBaseStaticPropsPage(rootDir, {
          routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
          handlerRouteParam: {
            name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
            kind: 'catch-all'
          }
        });
        await writeTestModule(
          path.join(
            rootDir,
            'node_modules',
            'test-route-handlers',
            'primary',
            'processor.js'
          ),
          createCountedProcessorSource(processorLogPath)
        );
        await writeTestModule(routeFilePath, '# Guides\n');
        const bootstrapState = createBootstrappedLazyAnalysisState({
          rootDir,
          routeHandlersConfig
        });

        const resolution = await resolveRouteHandlerLazyRequest(
          '/content/guides',
          bootstrapState.resolvedTargets
        );

        expect(resolution.kind).toBe('matched-route-file');
        if (resolution.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        const firstResult = await analyzeRouteHandlerLazyMatchedRoute({
          targetId: resolution.config.targetId,
          routePath: resolution.routePath,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId,
          lazySingleRouteCacheManager:
            bootstrapState.lazySingleRouteCacheManager
        });
        const secondResult = await analyzeRouteHandlerLazyMatchedRoute({
          targetId: resolution.config.targetId,
          routePath: resolution.routePath,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId,
          lazySingleRouteCacheManager:
            bootstrapState.lazySingleRouteCacheManager
        });

        expect(firstResult?.kind).toBe('light');
        expect(firstResult?.source).toBe('fresh');
        expect(secondResult?.kind).toBe('light');
        expect(secondResult?.source).toBe('cache');
        expect(await readLogEntries(processorLogPath)).toEqual([]);
        expect(captureRouteHandlerComponentGraphMock).toHaveBeenCalledTimes(1);
      }
    );
  });

  it('reuses persisted Stage 1 capture across bootstrap generation changes while the route file stays the same', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-single-route-',
      async rootDir => {
        const processorLogPath = path.join(rootDir, 'processor-calls.log');
        const routeHandlersConfig = createSingleTargetConfig({
          rootDir
        });
        const routeFilePath = path.join(
          rootDir,
          TEST_PRIMARY_CONTENT_PAGES_DIR,
          'guides',
          'en.mdx'
        );

        captureRouteHandlerComponentGraphMock.mockResolvedValue(
          createCapturedRouteHandlerGraphResult({
            usedComponentNames: ['CustomComponent']
          })
        );
        await writeTestRouteHandlerPackage(rootDir);
        await writeTestBaseStaticPropsPage(rootDir, {
          routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
          handlerRouteParam: {
            name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
            kind: 'catch-all'
          }
        });
        await writeTestModule(
          path.join(
            rootDir,
            'node_modules',
            'test-route-handlers',
            'primary',
            'processor.js'
          ),
          createCountedProcessorSource(processorLogPath)
        );
        await writeTestModule(routeFilePath, '# Guides\n');
        const baseBootstrapState = createBootstrappedLazyAnalysisState({
          rootDir,
          routeHandlersConfig
        });

        const firstResolution = await resolveRouteHandlerLazyRequest(
          '/content/guides',
          baseBootstrapState.resolvedTargets
        );
        if (firstResolution.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        await analyzeRouteHandlerLazyMatchedRoute({
          targetId: firstResolution.config.targetId,
          routePath: firstResolution.routePath,
          resolvedConfigsByTargetId:
            baseBootstrapState.resolvedConfigsByTargetId,
          lazySingleRouteCacheManager:
            baseBootstrapState.lazySingleRouteCacheManager
        });
        baseBootstrapState.lazySingleRouteCacheManager.close();

        const nextBootstrapState = createBootstrappedLazyAnalysisState({
          rootDir,
          routeHandlersConfig
        });

        const secondResolution = await resolveRouteHandlerLazyRequest(
          '/content/guides',
          nextBootstrapState.resolvedTargets
        );
        if (secondResolution.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        const secondResult = await analyzeRouteHandlerLazyMatchedRoute({
          targetId: secondResolution.config.targetId,
          routePath: secondResolution.routePath,
          resolvedConfigsByTargetId:
            nextBootstrapState.resolvedConfigsByTargetId,
          lazySingleRouteCacheManager:
            nextBootstrapState.lazySingleRouteCacheManager
        });

        expect(secondResult?.kind).toBe('heavy');
        expect(secondResult?.source).toBe('cache');
        expect(await readLogEntries(processorLogPath)).toEqual([
          routeFilePath,
          routeFilePath
        ]);
        expect(captureRouteHandlerComponentGraphMock).toHaveBeenCalledTimes(1);
      }
    );
  });

  it('re-analyzes the route when the backing content file changes even if it stays heavy', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-single-route-',
      async rootDir => {
        const processorLogPath = path.join(rootDir, 'processor-calls.log');
        const routeHandlersConfig = createSingleTargetConfig({
          rootDir
        });
        const routeFilePath = path.join(
          rootDir,
          TEST_PRIMARY_CONTENT_PAGES_DIR,
          'guides',
          'en.mdx'
        );

        captureRouteHandlerComponentGraphMock.mockResolvedValue(
          createCapturedRouteHandlerGraphResult({
            usedComponentNames: ['CustomComponent']
          })
        );
        await writeTestRouteHandlerPackage(rootDir);
        await writeTestBaseStaticPropsPage(rootDir, {
          routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
          handlerRouteParam: {
            name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
            kind: 'catch-all'
          }
        });
        await writeTestModule(
          path.join(
            rootDir,
            'node_modules',
            'test-route-handlers',
            'primary',
            'processor.js'
          ),
          createCountedProcessorSource(processorLogPath)
        );
        await writeTestModule(routeFilePath, '# Guides\n');
        const bootstrapState = createBootstrappedLazyAnalysisState({
          rootDir,
          routeHandlersConfig
        });

        const resolution = await resolveRouteHandlerLazyRequest(
          '/content/guides',
          bootstrapState.resolvedTargets
        );
        if (resolution.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        const firstResult = await analyzeRouteHandlerLazyMatchedRoute({
          targetId: resolution.config.targetId,
          routePath: resolution.routePath,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId,
          lazySingleRouteCacheManager:
            bootstrapState.lazySingleRouteCacheManager
        });

        await writeTestModule(routeFilePath, '# Guides updated\n');

        const secondResult = await analyzeRouteHandlerLazyMatchedRoute({
          targetId: resolution.config.targetId,
          routePath: resolution.routePath,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId,
          lazySingleRouteCacheManager:
            bootstrapState.lazySingleRouteCacheManager
        });

        expect(firstResult?.kind).toBe('heavy');
        expect(firstResult?.source).toBe('fresh');
        expect(secondResult?.kind).toBe('heavy');
        expect(secondResult?.source).toBe('fresh');
        expect(await readLogEntries(processorLogPath)).toEqual([
          routeFilePath,
          routeFilePath
        ]);
        expect(captureRouteHandlerComponentGraphMock).toHaveBeenCalledTimes(2);
      }
    );
  });

  it('re-analyzes the route when a persisted transitive imported MDX file changes', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-single-route-',
      async rootDir => {
        const processorLogPath = path.join(rootDir, 'processor-calls.log');
        const routeHandlersConfig = createSingleTargetConfig({
          rootDir
        });
        const routeFilePath = path.join(
          rootDir,
          TEST_PRIMARY_CONTENT_PAGES_DIR,
          'guides',
          'en.mdx'
        );
        const fragmentFilePath = path.join(
          rootDir,
          TEST_PRIMARY_CONTENT_PAGES_DIR,
          'guides',
          'fragment.mdx'
        );

        captureRouteHandlerComponentGraphMock.mockResolvedValue(
          createCapturedRouteHandlerGraphResult({
            usedComponentNames: ['CustomComponent'],
            transitiveModulePaths: [fragmentFilePath]
          })
        );
        await writeTestRouteHandlerPackage(rootDir);
        await writeTestBaseStaticPropsPage(rootDir, {
          routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
          handlerRouteParam: {
            name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
            kind: 'catch-all'
          }
        });
        await writeTestModule(
          path.join(
            rootDir,
            'node_modules',
            'test-route-handlers',
            'primary',
            'processor.js'
          ),
          createCountedProcessorSource(processorLogPath)
        );
        await writeTestModule(routeFilePath, '# Guides\n');
        await writeTestModule(fragmentFilePath, '# Fragment\n');
        const bootstrapState = createBootstrappedLazyAnalysisState({
          rootDir,
          routeHandlersConfig
        });

        const resolution = await resolveRouteHandlerLazyRequest(
          '/content/guides',
          bootstrapState.resolvedTargets
        );
        if (resolution.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        const firstResult = await analyzeRouteHandlerLazyMatchedRoute({
          targetId: resolution.config.targetId,
          routePath: resolution.routePath,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId,
          lazySingleRouteCacheManager:
            bootstrapState.lazySingleRouteCacheManager
        });

        await writeTestModule(fragmentFilePath, '# Fragment updated\n');

        const secondResult = await analyzeRouteHandlerLazyMatchedRoute({
          targetId: resolution.config.targetId,
          routePath: resolution.routePath,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId,
          lazySingleRouteCacheManager:
            bootstrapState.lazySingleRouteCacheManager
        });

        expect(firstResult?.kind).toBe('heavy');
        expect(firstResult?.source).toBe('fresh');
        expect(secondResult?.kind).toBe('heavy');
        expect(secondResult?.source).toBe('fresh');
        expect(await readLogEntries(processorLogPath)).toEqual([
          routeFilePath,
          routeFilePath
        ]);
        expect(captureRouteHandlerComponentGraphMock).toHaveBeenCalledTimes(2);
      }
    );
  });
});
