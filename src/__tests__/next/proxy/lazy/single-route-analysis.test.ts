import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureReferencedComponentNamesMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../../core/capture'), () => ({
  captureReferencedComponentNames: captureReferencedComponentNamesMock
}));

import { createCatchAllRouteHandlersPreset } from '../../../../next/config';
import { resolveRouteHandlersConfigsFromAppConfig } from '../../../../next/config/resolve-configs';
import { resolveRouteHandlersAppContext } from '../../../../next/internal/route-handlers-bootstrap';
import {
  resolveRouteHandlerLazyRequest,
  resolveRouteHandlerLazyResolvedTargetsFromAppConfig
} from '../../../../next/proxy/lazy/request-resolution';
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
} from '../../../../next/types';
import type { RouteHandlerLazyResolvedTarget } from '../../../../next/proxy/lazy/types';

function remarkNoop() {
  return undefined;
}

const TEST_LOCALE_CONFIG = {
  locales: ['en'],
  defaultLocale: 'en'
};
const TEST_BOOTSTRAP_GENERATION_TOKEN = 'bootstrap-1';
const TEST_NEXT_BOOTSTRAP_GENERATION_TOKEN = 'bootstrap-2';

const createCountedProcessorSource = (logPath: string): string =>
  [
    "import { appendFileSync } from 'node:fs';",
    `const logPath = ${JSON.stringify(logPath)};`,
    'export const routeHandlerProcessor = {',
    '  resolve({ route, capturedComponentKeys }) {',
    "    appendFileSync(logPath, `${route.filePath}\\n`);",
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
  app: {
    rootDir
  },
  ...createCatchAllRouteHandlersPreset({
    routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
    handlerRouteParam: {
      name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
      kind: 'catch-all'
    },
    contentPagesDir: path.join(rootDir, TEST_PRIMARY_CONTENT_PAGES_DIR),
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
} => {
  const appContext = resolveRouteHandlersAppContext(
    routeHandlersConfig,
    rootDir
  );
  const bootstrappedRouteHandlersConfig =
    appContext.routeHandlersConfig ?? routeHandlersConfig;
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
      bootstrapGenerationToken: TEST_BOOTSTRAP_GENERATION_TOKEN,
      resolvedConfigsByTargetId: new Map()
    });

    expect(result).toBeNull();
  });

  it('analyzes one matched route file once and reuses the cached heavy result on later calls', async () => {
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

        captureReferencedComponentNamesMock.mockResolvedValue(['CustomComponent']);
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
          bootstrapGenerationToken: TEST_BOOTSTRAP_GENERATION_TOKEN,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId
        });
        const secondResult = await analyzeRouteHandlerLazyMatchedRoute({
          targetId: resolution.config.targetId,
          routePath: resolution.routePath,
          bootstrapGenerationToken: TEST_BOOTSTRAP_GENERATION_TOKEN,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId
        });

        expect(firstResult?.kind).toBe('heavy');
        expect(firstResult?.source).toBe('fresh');
        expect(secondResult?.kind).toBe('heavy');
        expect(secondResult?.source).toBe('cache');
        expect(await readLogEntries(processorLogPath)).toEqual([routeFilePath]);
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

        captureReferencedComponentNamesMock.mockResolvedValue([]);
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
          bootstrapGenerationToken: TEST_BOOTSTRAP_GENERATION_TOKEN,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId
        });
        const secondResult = await analyzeRouteHandlerLazyMatchedRoute({
          targetId: resolution.config.targetId,
          routePath: resolution.routePath,
          bootstrapGenerationToken: TEST_BOOTSTRAP_GENERATION_TOKEN,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId
        });

        expect(firstResult?.kind).toBe('light');
        expect(firstResult?.source).toBe('fresh');
        expect(secondResult?.kind).toBe('light');
        expect(secondResult?.source).toBe('cache');
        expect(await readLogEntries(processorLogPath)).toEqual([]);
      }
    );
  });

  it('invalidates the cached one-file result when the bootstrap generation changes while the route file stays the same', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-single-route-',
      async rootDir => {
        const processorLogPath = path.join(rootDir, 'processor-calls.log');
        const baseConfig = createSingleTargetConfig({
          rootDir
        });
        const invalidatedConfig = createSingleTargetConfig({
          rootDir,
          targetOverrides: {
            mdxCompileOptions: {
              remarkPlugins: [remarkNoop]
            }
          }
        });
        const routeFilePath = path.join(
          rootDir,
          TEST_PRIMARY_CONTENT_PAGES_DIR,
          'guides',
          'en.mdx'
        );

        captureReferencedComponentNamesMock.mockResolvedValue(['CustomComponent']);
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
          routeHandlersConfig: baseConfig
        });
        const invalidatedBootstrapState = createBootstrappedLazyAnalysisState({
          rootDir,
          routeHandlersConfig: invalidatedConfig
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
          bootstrapGenerationToken: TEST_BOOTSTRAP_GENERATION_TOKEN,
          resolvedConfigsByTargetId:
            baseBootstrapState.resolvedConfigsByTargetId
        });

        const secondResolution = await resolveRouteHandlerLazyRequest(
          '/content/guides',
          invalidatedBootstrapState.resolvedTargets
        );
        if (secondResolution.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        const secondResult = await analyzeRouteHandlerLazyMatchedRoute({
          targetId: secondResolution.config.targetId,
          routePath: secondResolution.routePath,
          bootstrapGenerationToken: TEST_NEXT_BOOTSTRAP_GENERATION_TOKEN,
          resolvedConfigsByTargetId:
            invalidatedBootstrapState.resolvedConfigsByTargetId
        });

        expect(secondResult?.kind).toBe('heavy');
        expect(secondResult?.source).toBe('fresh');
        expect(await readLogEntries(processorLogPath)).toEqual([
          routeFilePath,
          routeFilePath
        ]);
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

        captureReferencedComponentNamesMock.mockResolvedValue(['CustomComponent']);
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
          bootstrapGenerationToken: TEST_BOOTSTRAP_GENERATION_TOKEN,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId
        });

        await writeTestModule(routeFilePath, '# Guides updated\n');

        const secondResult = await analyzeRouteHandlerLazyMatchedRoute({
          targetId: resolution.config.targetId,
          routePath: resolution.routePath,
          bootstrapGenerationToken: TEST_BOOTSTRAP_GENERATION_TOKEN,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId
        });

        expect(firstResult?.kind).toBe('heavy');
        expect(firstResult?.source).toBe('fresh');
        expect(secondResult?.kind).toBe('heavy');
        expect(secondResult?.source).toBe('fresh');
        expect(await readLogEntries(processorLogPath)).toEqual([
          routeFilePath,
          routeFilePath
        ]);
      }
    );
  });
});
