import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createRuntimeTraitVariantResolver } from '../../core/runtime-variants';
import { absoluteFileModule, packageModule } from '../../module-reference';
import {
  createRouteHandlerProcessCacheIdentity,
  isSameRouteHandlerProcessCacheIdentity
} from '../../next/process-cache-identity';
import { createTestPaths } from '../helpers/builders';
import {
  TEST_PRIMARY_COMPONENTS_IMPORT,
  TEST_PRIMARY_FACTORY_IMPORT,
  TEST_PRIMARY_ROUTE_SEGMENT
} from '../helpers/fixtures';

import type { ResolvedRouteHandlersConfig } from '../../next/types';

const resolveHandlerFactoryVariant = createRuntimeTraitVariantResolver({
  defaultVariant: 'none',
  rules: []
});

function testRemarkPlugin() {}

const createResolvedConfig = (
  overrides: Partial<ResolvedRouteHandlersConfig> = {}
): ResolvedRouteHandlersConfig => ({
  app: {
    rootDir: '/tmp/test-route-handlers-app',
    nextConfigPath: '/tmp/test-route-handlers-app/next.config.mjs'
  },
  targetId: TEST_PRIMARY_ROUTE_SEGMENT,
  localeConfig: {
    locales: ['en', 'de'],
    defaultLocale: 'en'
  },
  emitFormat: 'ts',
  contentLocaleMode: 'filename',
  resolveHandlerFactoryVariant,
  handlerRouteParam: {
    name: 'slug',
    kind: 'catch-all'
  },
  runtimeHandlerFactoryImportBase: packageModule(TEST_PRIMARY_FACTORY_IMPORT),
  baseStaticPropsImport: absoluteFileModule(
    path.join(
      '/tmp/test-route-handlers-app',
      'pages',
      'content',
      '[...entry]'
    )
  ),
  componentsImport: packageModule(TEST_PRIMARY_COMPONENTS_IMPORT),
  pageConfigImport: absoluteFileModule(
    path.join('/tmp/test-route-handlers-app', 'src', 'page-config.tsx')
  ),
  mdxCompileOptions: {},
  routeBasePath: '/content',
  paths: createTestPaths('/tmp/test-route-handlers-app'),
  ...overrides
});

describe('process cache identity', () => {
  it('treats handlerRouteParam as part of the generation identity', () => {
    const left = createRouteHandlerProcessCacheIdentity({
      phase: 'phase-production-build',
      configs: [createResolvedConfig()]
    });
    const right = createRouteHandlerProcessCacheIdentity({
      phase: 'phase-production-build',
      configs: [
        createResolvedConfig({
          handlerRouteParam: {
            name: 'slug',
            kind: 'single'
          }
        })
      ]
    });

    expect(
      isSameRouteHandlerProcessCacheIdentity(left, right)
    ).toBe(false);
  });

  it('treats mdxCompileOptions as part of the generation identity', () => {
    const left = createRouteHandlerProcessCacheIdentity({
      phase: 'phase-production-build',
      configs: [createResolvedConfig()]
    });
    const right = createRouteHandlerProcessCacheIdentity({
      phase: 'phase-production-build',
      configs: [
        createResolvedConfig({
          mdxCompileOptions: {
            remarkPlugins: [testRemarkPlugin]
          }
        })
      ]
    });

    expect(
      isSameRouteHandlerProcessCacheIdentity(left, right)
    ).toBe(false);
  });

  it('treats pageConfigImport as part of the generation identity', () => {
    const left = createRouteHandlerProcessCacheIdentity({
      phase: 'phase-production-build',
      configs: [createResolvedConfig()]
    });
    const right = createRouteHandlerProcessCacheIdentity({
      phase: 'phase-production-build',
      configs: [
        createResolvedConfig({
          pageConfigImport: absoluteFileModule(
            path.join('/tmp/test-route-handlers-app', 'src', 'other-page-config.tsx')
          )
        })
      ]
    });

    expect(
      isSameRouteHandlerProcessCacheIdentity(left, right)
    ).toBe(false);
  });
});
