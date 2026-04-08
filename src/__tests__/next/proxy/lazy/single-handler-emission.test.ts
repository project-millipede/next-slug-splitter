import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureRouteHandlerComponentGraphMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../../core/capture'), () => ({
  captureRouteHandlerComponentGraph: captureRouteHandlerComponentGraphMock
}));

import { createCatchAllRouteHandlersPreset } from '../../../../next/config';
import { resolveRouteHandlersConfigsFromAppConfig } from '../../../../next/config/resolve-configs';
import { resolveRouteHandlersAppContext } from '../../../../next/internal/route-handlers-bootstrap';
import {
  resolveRouteHandlerLazyRequest,
  resolveRouteHandlerLazyResolvedTargetsFromAppConfig
} from '../../../../next/proxy/lazy/request-resolution';
import { createRouteHandlerLazySingleRouteCacheManager } from '../../../../next/proxy/lazy/single-route-cache-manager';
import { emitRouteHandlerLazySingleHandler } from '../../../../next/proxy/lazy/single-handler-emission';
import { analyzeRouteHandlerLazyMatchedRoute } from '../../../../next/proxy/lazy/single-route-analysis';
import { resolveRouteHandlerLazyRewriteDestination } from '../../../../next/proxy/lazy/single-route-rewrite';
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
  RouteHandlersConfig
} from '../../../../next/types';
import type { RouteHandlerLazyResolvedTarget } from '../../../../next/proxy/lazy/types';

const TEST_LOCALE_CONFIG = {
  locales: ['en'],
  defaultLocale: 'en'
};
const TEST_BOOTSTRAP_GENERATION_TOKEN = 'bootstrap-1';

/**
 * Create a minimal captured MDX graph result for one route file.
 *
 * @param routeFilePath - Root route file path.
 * @param usedComponentNames - Captured component names for the route.
 * @returns Minimal captured graph result used by lazy tests.
 */
const createCapturedRouteHandlerGraphResult = (
  _routeFilePath: string,
  usedComponentNames: Array<string>
): {
  usedComponentNames: Array<string>;
  transitiveModulePaths: Array<string>;
} => ({
  usedComponentNames,
  transitiveModulePaths: []
});

const createSingleTargetConfig = ({
  rootDir
}: {
  rootDir: string;
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
    handlerBinding: createTestHandlerBinding()
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

describe('proxy lazy single-handler emission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes one generated handler file and reuses it unchanged on the next call', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-emission-',
      async rootDir => {
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
          createCapturedRouteHandlerGraphResult(routeFilePath, [
            'CustomComponent'
          ])
        );
        await writeTestRouteHandlerPackage(rootDir);
        await writeTestBaseStaticPropsPage(rootDir, {
          routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
          handlerRouteParam: {
            name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
            kind: 'catch-all'
          }
        });
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

        const analysisResult = await analyzeRouteHandlerLazyMatchedRoute({
          targetId: resolution.config.targetId,
          routePath: resolution.routePath,
          bootstrapGenerationToken: TEST_BOOTSTRAP_GENERATION_TOKEN,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId,
          lazySingleRouteCacheManager: bootstrapState.lazySingleRouteCacheManager
        });
        if (analysisResult?.kind !== 'heavy') {
          throw new Error('Expected heavy single-route analysis.');
        }

        const emittedPageFilePath = path.join(
          rootDir,
          'pages',
          TEST_PRIMARY_ROUTE_SEGMENT,
          '_handlers',
          'guides',
          'en.tsx'
        );

        const firstStatus =
          await emitRouteHandlerLazySingleHandler(analysisResult);
        const secondStatus =
          await emitRouteHandlerLazySingleHandler(analysisResult);
        const emittedSource = await readFile(emittedPageFilePath, 'utf8');

        expect(emittedPageFilePath).toBe(
          path.join(
            rootDir,
            'pages',
            TEST_PRIMARY_ROUTE_SEGMENT,
            '_handlers',
            'guides',
            'en.tsx'
          )
        );
        expect(emittedSource).toContain(
          '// AUTO-GENERATED ROUTE HANDLER. DO NOT EDIT.'
        );
        expect(firstStatus).toBe('created');
        expect(secondStatus).toBe('unchanged');
        expect(
          resolveRouteHandlerLazyRewriteDestination(
            '/content/guides',
            analysisResult
          )
        ).toBe('/content/_handlers/guides/en');
      }
    );
  });
});
