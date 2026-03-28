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
} => {
  const appContext = resolveRouteHandlersAppContext(
    routeHandlersConfig,
    rootDir
  );
  const bootstrappedRouteHandlersConfig =
    appContext.routeHandlersConfig ?? routeHandlersConfig;
  const resolvedConfigs = resolveRouteHandlersConfigsFromAppConfig({
    appConfig: appContext.appConfig,
    localeConfig: TEST_LOCALE_CONFIG,
    routeHandlersConfig: bootstrappedRouteHandlersConfig
  });

  return {
    resolvedTargets: resolveRouteHandlerLazyResolvedTargetsFromAppConfig({
      appConfig: appContext.appConfig,
      localeConfig: TEST_LOCALE_CONFIG,
      routeHandlersConfig: bootstrappedRouteHandlersConfig
    }),
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

        captureReferencedComponentNamesMock.mockResolvedValue(['CustomComponent']);
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

        const resolution = await resolveRouteHandlerLazyRequest({
          pathname: '/content/guides',
          resolvedTargets: bootstrapState.resolvedTargets
        });
        if (resolution.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        const analysisResult = await analyzeRouteHandlerLazyMatchedRoute({
          targetId: resolution.config.targetId,
          routePath: resolution.routePath,
          bootstrapGenerationToken: TEST_BOOTSTRAP_GENERATION_TOKEN,
          resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId
        });
        if (analysisResult?.kind !== 'heavy') {
          throw new Error('Expected heavy single-route analysis.');
        }

        const firstEmission = await emitRouteHandlerLazySingleHandler({
          analysisResult
        });
        const secondEmission = await emitRouteHandlerLazySingleHandler({
          analysisResult
        });
        const emittedSource = await readFile(
          firstEmission.renderedPage.pageFilePath,
          'utf8'
        );

        expect(firstEmission.status).toBe('written');
        expect(secondEmission.status).toBe('unchanged');
        expect(firstEmission.renderedPage.pageFilePath).toBe(
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
        expect(
          resolveRouteHandlerLazyRewriteDestination({
            pathname: '/content/guides',
            analysisResult
          })
        ).toBe('/content/_handlers/guides/en');
      }
    );
  });
});
