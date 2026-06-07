import { describe, expect, test } from 'vitest';

import { absoluteModule } from '../../../../module-reference';
import { resolveRouteHandlerLazyRewriteDestination } from '../../../../next/proxy/lazy/single-route-rewrite';
import { createPlannedHeavyRoute } from '../../../helpers/builders';
import {
  TEST_MULTI_LOCALE_CONFIG,
  TEST_SLUG_CATCH_ALL_ROUTE_PARAM
} from '../../../helpers/fixtures';

import type { RouteHandlerLazyHeavyAnalysisResult } from '../../../../next/proxy/lazy/types';

const createAppHeavyAnalysisResult = (
  generatedDir: string
): RouteHandlerLazyHeavyAnalysisResult => ({
  kind: 'heavy',
  source: 'fresh',
  routePath: {
    filePath: '/repo/content/pages/dashboard/de.mdx',
    locale: 'de',
    slugArray: ['dashboard']
  },
  plannedHeavyRoute: createPlannedHeavyRoute({
    locale: 'de',
    slugArray: ['dashboard'],
    handlerId: 'de-dashboard',
    handlerRelativePath: 'dashboard/de',
    factoryImport: absoluteModule('/repo/dist/create-handler-page.js'),
    componentEntries: []
  }),
  config: {
    routerKind: 'app',
    targetId: 'docs',
    emitFormat: 'ts',
    contentLocaleMode: 'filename',
    handlerRouteParam: TEST_SLUG_CATCH_ALL_ROUTE_PARAM,
    routeBasePath: '/docs',
    localeConfig: TEST_MULTI_LOCALE_CONFIG,
    handlerRouteSegment: 'generated-handlers',
    routeContract: absoluteModule(
      '/repo/app/[locale]/docs/[...slug]/route-contract.ts'
    ),
    routeModule: {
      hasGeneratePageMetadata: false
    },
    localeRouteParamName: 'locale',
    processorConfig: {
      processorImport: absoluteModule('/repo/dist/processor.js')
    },
    runtime: {
      mdxCompileOptions: {}
    },
    paths: {
      rootDir: '/repo',
      contentDir: '/repo/content/pages',
      generatedDir
    }
  }
});

describe('proxy lazy single-route rewrite', () => {
  test('keeps conventional App generated-handler destinations locale-less', () => {
    expect(
      resolveRouteHandlerLazyRewriteDestination(
        '/de/docs/dashboard',
        createAppHeavyAnalysisResult('/repo/app/docs/generated-handlers')
      )
    ).toBe('/docs/generated-handlers/dashboard/de');
  });

  test('prefixes App generated-handler destinations below a locale route segment', () => {
    expect(
      resolveRouteHandlerLazyRewriteDestination(
        '/de/docs/dashboard',
        createAppHeavyAnalysisResult(
          '/repo/app/[locale]/docs/generated-handlers'
        )
      )
    ).toBe('/de/docs/generated-handlers/dashboard/de');
  });
});
