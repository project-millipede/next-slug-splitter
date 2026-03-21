import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const executeRouteHandlerNextPipelineMock = vi.hoisted(() => vi.fn());
const readPersistedRouteHandlerLazyDiscoveryHeavyRoutePathKeysMock =
  vi.hoisted(() => vi.fn());

vi.mock('../../next/runtime', () => ({
  executeRouteHandlerNextPipeline: executeRouteHandlerNextPipelineMock
}));

vi.mock('../../next/proxy/lazy/lookup', () => ({
  readPersistedRouteHandlerLazyDiscoveryHeavyRoutePathKeys:
    readPersistedRouteHandlerLazyDiscoveryHeavyRoutePathKeysMock
}));

import { createHeavyRoute } from '../helpers/builders';
import {
  TEST_CATCH_ALL_ROUTE_PARAM_NAME,
  TEST_PRIMARY_CONTENT_PAGES_DIR,
  TEST_PRIMARY_ROUTE_SEGMENT,
  createTestHandlerBinding,
  writeTestBaseStaticPropsPage,
  writeTestRouteHandlerPackage
} from '../helpers/fixtures';
import { withTempDir } from '../helpers/temp-dir';
import { createCatchAllRouteHandlersPreset } from '../../next/config';
import { registerRouteHandlersConfig } from '../../next/integration/config-registry';
import { withHeavyRouteFilter } from '../../next/lookup';

import type { RouteHandlersConfig } from '../../next/types';

const createSingleTargetConfig = ({
  rootDir,
  developmentRoutingMode = 'rewrites'
}: {
  rootDir: string;
  developmentRoutingMode?: 'proxy' | 'rewrites';
}): RouteHandlersConfig => ({
  app: {
    rootDir,
    nextConfigPath: path.join(rootDir, 'next.config.mjs'),
    routing: {
      development: developmentRoutingMode
    }
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

const createPathEntries = () => [
  { params: { slug: ['getting-started'] }, locale: 'en' },
  { params: { slug: ['heavy-page'] }, locale: 'en' },
  { params: { slug: ['another-page'] }, locale: 'en' },
  { params: { slug: ['heavy-page'] }, locale: 'de' }
];

describe('withHeavyRouteFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readPersistedRouteHandlerLazyDiscoveryHeavyRoutePathKeysMock.mockResolvedValue(
      new Set()
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('filters heavy routes in rewrite mode', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await withTempDir('next-slug-splitter-filter-rewrite-', async rootDir => {
      executeRouteHandlerNextPipelineMock.mockResolvedValue({
        analyzedCount: 4,
        heavyCount: 2,
        heavyPaths: [
          createHeavyRoute({
            targetId: TEST_PRIMARY_ROUTE_SEGMENT,
            locale: 'en',
            slugArray: ['heavy-page'],
            handlerId: 'en-heavy-page',
            handlerRelativePath: 'heavy-page/en'
          }),
          createHeavyRoute({
            targetId: TEST_PRIMARY_ROUTE_SEGMENT,
            locale: 'de',
            slugArray: ['heavy-page'],
            handlerId: 'de-heavy-page',
            handlerRelativePath: 'heavy-page/de'
          })
        ],
        rewrites: []
      });

      await writeTestRouteHandlerPackage(rootDir);
      await writeTestBaseStaticPropsPage(rootDir, {
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        }
      });

      registerRouteHandlersConfig(createSingleTargetConfig({ rootDir }));

      const getStaticPaths = withHeavyRouteFilter({
        targetId: TEST_PRIMARY_ROUTE_SEGMENT,
        getStaticPaths: async () => ({
          paths: createPathEntries(),
          fallback: false
        })
      });

      const result = await getStaticPaths({});

      expect(result.paths).toEqual([
        { params: { slug: ['getting-started'] }, locale: 'en' },
        { params: { slug: ['another-page'] }, locale: 'en' }
      ]);
      expect(result.fallback).toBe(false);
    });
  });

  it('returns all paths unfiltered in proxy mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await withTempDir('next-slug-splitter-filter-proxy-', async rootDir => {
      const allPaths = createPathEntries();

      registerRouteHandlersConfig(createSingleTargetConfig({
        rootDir,
        developmentRoutingMode: 'proxy'
      }));

      const getStaticPaths = withHeavyRouteFilter({
        targetId: TEST_PRIMARY_ROUTE_SEGMENT,
        getStaticPaths: async () => ({
          paths: allPaths,
          fallback: false
        })
      });

      const result = await getStaticPaths({});

      expect(result.paths).toEqual(allPaths);
      expect(result.fallback).toBe(false);
      expect(executeRouteHandlerNextPipelineMock).not.toHaveBeenCalled();
    });
  });

  it('supports single-segment slug params', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await withTempDir('next-slug-splitter-filter-single-', async rootDir => {
      executeRouteHandlerNextPipelineMock.mockResolvedValue({
        analyzedCount: 2,
        heavyCount: 1,
        heavyPaths: [
          createHeavyRoute({
            targetId: TEST_PRIMARY_ROUTE_SEGMENT,
            locale: 'en',
            slugArray: ['heavy-post'],
            handlerId: 'en-heavy-post',
            handlerRelativePath: 'heavy-post/en'
          })
        ],
        rewrites: []
      });

      await writeTestRouteHandlerPackage(rootDir);
      await writeTestBaseStaticPropsPage(rootDir, {
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        }
      });

      registerRouteHandlersConfig(createSingleTargetConfig({ rootDir }));

      const getStaticPaths = withHeavyRouteFilter({
        targetId: TEST_PRIMARY_ROUTE_SEGMENT,
        slugParam: 'slug',
        getStaticPaths: async () => ({
          paths: [
            { params: { slug: 'light-post' }, locale: 'en' },
            { params: { slug: 'heavy-post' }, locale: 'en' }
          ],
          fallback: false
        })
      });

      const result = await getStaticPaths({});

      expect(result.paths).toEqual([
        { params: { slug: 'light-post' }, locale: 'en' }
      ]);
    });
  });

  it('keeps entries without locale or slug', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await withTempDir('next-slug-splitter-filter-missing-', async rootDir => {
      executeRouteHandlerNextPipelineMock.mockResolvedValue({
        analyzedCount: 1,
        heavyCount: 1,
        heavyPaths: [
          createHeavyRoute({
            targetId: TEST_PRIMARY_ROUTE_SEGMENT,
            locale: 'en',
            slugArray: ['heavy-page'],
            handlerId: 'en-heavy-page',
            handlerRelativePath: 'heavy-page/en'
          })
        ],
        rewrites: []
      });

      await writeTestRouteHandlerPackage(rootDir);
      await writeTestBaseStaticPropsPage(rootDir, {
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        }
      });

      const entries = [
        { params: { slug: ['heavy-page'] }, locale: 'en' },
        { params: { slug: ['some-page'] } },
        { params: { id: 'no-slug-entry' }, locale: 'en' }
      ] as Array<{ params: Record<string, string | Array<string>>; locale?: string }>;

      registerRouteHandlersConfig(createSingleTargetConfig({ rootDir }));

      const getStaticPaths = withHeavyRouteFilter({
        targetId: TEST_PRIMARY_ROUTE_SEGMENT,
        getStaticPaths: async () => ({
          paths: entries,
          fallback: false
        })
      });

      const result = await getStaticPaths({});

      expect(result.paths).toEqual([
        { params: { slug: ['some-page'] } },
        { params: { id: 'no-slug-entry' }, locale: 'en' }
      ]);
    });
  });

  it('preserves fallback value from inner getStaticPaths', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await withTempDir('next-slug-splitter-filter-fallback-', async rootDir => {
      registerRouteHandlersConfig(createSingleTargetConfig({
        rootDir,
        developmentRoutingMode: 'proxy'
      }));

      const getStaticPaths = withHeavyRouteFilter({
        targetId: TEST_PRIMARY_ROUTE_SEGMENT,
        getStaticPaths: async () => ({
          paths: [],
          fallback: 'blocking'
        })
      });

      const result = await getStaticPaths({});

      expect(result.fallback).toBe('blocking');
    });
  });
});
