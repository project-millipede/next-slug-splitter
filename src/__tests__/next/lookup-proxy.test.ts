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
import {
  loadRouteHandlerCacheLookup,
  shouldFilterHeavyRoutesInStaticPaths
} from '../../next/lookup';

import type { RouteHandlersConfig } from '../../next/types';

const createSingleTargetConfig = ({
  rootDir,
  developmentRoutingMode = 'proxy'
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

describe('route handler cache lookup proxy behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readPersistedRouteHandlerLazyDiscoveryHeavyRoutePathKeysMock.mockResolvedValue(
      new Set()
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not trigger full generate fallback in development proxy mode when shared cache is stale', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await withTempDir('next-slug-splitter-lookup-proxy-', async rootDir => {
      readPersistedRouteHandlerLazyDiscoveryHeavyRoutePathKeysMock.mockResolvedValue(
        new Set(['en:known/heavy'])
      );
      await writeTestRouteHandlerPackage(rootDir);
      await writeTestBaseStaticPropsPage(rootDir, {
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        }
      });
      const lookup = await loadRouteHandlerCacheLookup({
        routeHandlersConfig: createSingleTargetConfig({
          rootDir
        }),
        targetId: TEST_PRIMARY_ROUTE_SEGMENT
      });

      expect(
        readPersistedRouteHandlerLazyDiscoveryHeavyRoutePathKeysMock
      ).toHaveBeenCalledWith({
        rootDir,
        targetId: TEST_PRIMARY_ROUTE_SEGMENT
      });
      expect(executeRouteHandlerNextPipelineMock).not.toHaveBeenCalled();
      expect(lookup.isHeavyRoute('en', ['known', 'heavy'])).toBe(true);
      expect(lookup.isHeavyRoute('en', ['unknown'])).toBe(false);
    });
  });

  it('tells getStaticPaths to skip heavy-route filtering in development proxy mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await withTempDir('next-slug-splitter-static-path-policy-proxy-', async rootDir => {
      expect(
        await shouldFilterHeavyRoutesInStaticPaths({
          routeHandlersConfig: createSingleTargetConfig({
            rootDir
          })
        })
      ).toBe(false);
    });
  });

  it('still triggers full generate fallback when development explicitly uses rewrites', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await withTempDir('next-slug-splitter-lookup-rewrites-', async rootDir => {
      executeRouteHandlerNextPipelineMock.mockResolvedValue({
        analyzedCount: 1,
        heavyCount: 1,
        heavyPaths: [
          createHeavyRoute({
            targetId: TEST_PRIMARY_ROUTE_SEGMENT,
            locale: 'en',
            slugArray: ['generated'],
            handlerId: 'en-generated',
            handlerRelativePath: 'generated/en'
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

      const lookup = await loadRouteHandlerCacheLookup({
        routeHandlersConfig: createSingleTargetConfig({
          rootDir,
          developmentRoutingMode: 'rewrites'
        }),
        targetId: TEST_PRIMARY_ROUTE_SEGMENT
      });

      expect(executeRouteHandlerNextPipelineMock).toHaveBeenCalledTimes(1);
      expect(lookup.isHeavyRoute('en', ['generated'])).toBe(true);
    });
  });

  it('tells getStaticPaths to keep heavy-route filtering outside development proxy mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await withTempDir(
      'next-slug-splitter-static-path-policy-rewrites-',
      async rootDir => {
        expect(
          await shouldFilterHeavyRoutesInStaticPaths({
            routeHandlersConfig: createSingleTargetConfig({
              rootDir,
              developmentRoutingMode: 'rewrites'
            })
          })
        ).toBe(true);
      }
    );
  });
});
