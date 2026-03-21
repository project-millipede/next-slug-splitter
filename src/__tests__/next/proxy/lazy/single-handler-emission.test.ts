import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureReferencedComponentNamesMock = vi.hoisted(() => vi.fn());
const loadRegisteredSlugSplitterConfigMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../core/capture', () => ({
  captureReferencedComponentNames: captureReferencedComponentNamesMock
}));

vi.mock('../../../../next/integration/slug-splitter-config-loader', () => ({
  loadRegisteredSlugSplitterConfig: loadRegisteredSlugSplitterConfigMock
}));

import { createCatchAllRouteHandlersPreset } from '../../../../next/config';
import { emitRouteHandlerLazySingleHandler } from '../../../../next/proxy/lazy/single-handler-emission';
import { resolveRouteHandlerLazyRequest } from '../../../../next/proxy/lazy/request-resolution';
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

import type { RouteHandlersConfig } from '../../../../next/types';

const createSingleTargetConfig = ({
  rootDir
}: {
  rootDir: string;
}): RouteHandlersConfig => ({
  app: {
    rootDir,
    nextConfigPath: path.join(rootDir, 'next.config.mjs')
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
        await writeTestModule(
          path.join(rootDir, 'next.config.mjs'),
          'export default {};\n'
        );
        await writeTestModule(routeFilePath, '# Guides\n');
        loadRegisteredSlugSplitterConfigMock.mockResolvedValue(routeHandlersConfig);

        const resolution = await resolveRouteHandlerLazyRequest({
          pathname: '/content/guides',
          localeConfig: {
            locales: ['en'],
            defaultLocale: 'en'
          }
        });
        if (resolution.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        const analysisResult = await analyzeRouteHandlerLazyMatchedRoute({
          resolution
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
