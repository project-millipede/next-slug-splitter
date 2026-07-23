import { describe, expect, test } from 'vitest';

import { packageModule } from '../../../../module-reference';
import { buildRouteHandlerNextResult } from '../../../../next/pages/runtime/results';
import { createHeavyRoute } from '../../../helpers/builders';
import {
  TEST_MULTI_LOCALE_CONFIG,
  TEST_SINGLE_LOCALE_CONFIG,
  TEST_SLUG_CATCH_ALL_ROUTE_PARAM
} from '../../../helpers/fixtures';

import type {
  LocaleConfig,
  RouteHandlerPipelineResult
} from '../../../../core/types';
import type { ResolvedRouteHandlersConfig } from '../../../../next/pages/types';

const createResolvedConfig = (
  localeConfig: LocaleConfig
): ResolvedRouteHandlersConfig => ({
  routerKind: 'pages',
  targetId: 'docs',
  app: {
    rootDir: '/repo',
    routing: {
      development: 'proxy',
      workerPrewarm: 'off'
    }
  },
  localeConfig,
  emitFormat: 'ts',
  contentLocaleMode: 'filename',
  handlerRouteParam: TEST_SLUG_CATCH_ALL_ROUTE_PARAM,
  routeContract: packageModule('@test/docs-route-contract'),
  processorConfig: {
    processorImport: packageModule('@test/processor')
  },
  runtime: {
    mdxCompileOptions: {}
  },
  routeBasePath: '/docs',
  paths: {
    rootDir: '/repo',
    contentDir: '/repo/content/pages',
    generatedDir: '/repo/pages/docs/generated-handlers'
  }
});

const createPipelineResult = (
  heavyPaths: RouteHandlerPipelineResult['heavyPaths']
): RouteHandlerPipelineResult => ({
  analyzedCount: heavyPaths.length,
  heavyCount: heavyPaths.length,
  heavyPaths
});

describe('Pages runtime result destinations', () => {
  test('preserves route locales in multi-locale build destinations', () => {
    const pipelineResult = createPipelineResult([
      createHeavyRoute({
        locale: 'en',
        slugArray: ['dashboard'],
        handlerId: 'en-dashboard',
        handlerRelativePath: 'dashboard/en'
      }),
      createHeavyRoute({
        locale: 'de',
        slugArray: ['dashboard'],
        handlerId: 'de-dashboard',
        handlerRelativePath: 'dashboard/de'
      })
    ]);

    const result = buildRouteHandlerNextResult(
      createResolvedConfig(TEST_MULTI_LOCALE_CONFIG),
      pipelineResult
    );

    expect(result.rewrites).toEqual([
      {
        source: '/de/docs/dashboard',
        destination: '/de/docs/generated-handlers/dashboard/de',
        locale: false
      },
      {
        source: '/docs/dashboard',
        destination: '/en/docs/generated-handlers/dashboard/en',
        locale: false
      }
    ]);
    expect(result.rewritesOfDefaultLocale).toEqual([
      {
        source: '/en/docs/dashboard',
        destination: '/en/docs/generated-handlers/dashboard/en',
        locale: false
      }
    ]);
  });

  test('keeps single-locale build destinations locale-less', () => {
    const pipelineResult = createPipelineResult([
      createHeavyRoute({
        locale: 'en',
        slugArray: ['dashboard'],
        handlerId: 'en-dashboard',
        handlerRelativePath: 'dashboard'
      })
    ]);

    const result = buildRouteHandlerNextResult(
      createResolvedConfig(TEST_SINGLE_LOCALE_CONFIG),
      pipelineResult
    );

    expect(result.rewrites).toEqual([
      {
        source: '/docs/dashboard',
        destination: '/docs/generated-handlers/dashboard',
        locale: false
      }
    ]);
    expect(result.rewritesOfDefaultLocale).toEqual([]);
  });
});
