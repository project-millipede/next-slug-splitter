import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PIPELINE_CACHE_VERSION,
  computePipelineFingerprintForConfigs,
  resolvePersistentCachePath,
  writePersistentCacheRecord
} from '../../next/cache';
import {
  createCatchAllRouteHandlersPreset,
  packageModule,
  resolveRouteHandlersConfigBases
} from '../../next/config/index';
import { loadRouteHandlerCacheLookup } from '../../next/lookup';
import { createHeavyRoute } from '../helpers/builders';
import {
  TEST_CATCH_ALL_ROUTE_PARAM_NAME,
  TEST_PRIMARY_CONTENT_PAGES_DIR,
  TEST_PRIMARY_ROUTE_SEGMENT,
  TEST_SECONDARY_CONTENT_PAGES_DIR,
  TEST_SECONDARY_FACTORY_IMPORT,
  TEST_SECONDARY_REGISTRY_IMPORT,
  TEST_SECONDARY_ROUTE_SEGMENT,
  TEST_SINGLE_ROUTE_PARAM_NAME,
  createTestHandlerBinding,
  writeTestBaseStaticPropsPage,
  writeTestRouteHandlerPackage
} from '../helpers/fixtures';
import { withTempDir } from '../helpers/temp-dir';

import type { PipelineCacheRecord, RouteHandlersConfig } from '../../next/types';

describe('route-handler cache lookup', () => {
  it('returns heavy-route membership scoped to one target', async () => {
    await withTempDir('next-slug-splitter-lookup-', async rootDir => {
      const mockedNextConfigPath = path.join(rootDir, 'mocked-app-config.js');
      const primaryPagesDir = path.join(rootDir, TEST_PRIMARY_CONTENT_PAGES_DIR);
      const secondaryPagesDir = path.join(
        rootDir,
        TEST_SECONDARY_CONTENT_PAGES_DIR
      );

      await mkdir(primaryPagesDir, { recursive: true });
      await mkdir(secondaryPagesDir, { recursive: true });
      await writeTestRouteHandlerPackage(rootDir);
      await writeTestBaseStaticPropsPage(rootDir, {
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        }
      });
      await writeTestBaseStaticPropsPage(rootDir, {
        routeSegment: TEST_SECONDARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_SINGLE_ROUTE_PARAM_NAME,
          kind: 'single'
        }
      });

      const routeHandlersConfig: RouteHandlersConfig = {
        app: {
          rootDir,
          nextConfigPath: mockedNextConfigPath
        },
        targets: [
          createCatchAllRouteHandlersPreset({
            routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
            handlerRouteParam: {
              name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
              kind: 'catch-all'
            },
            contentPagesDir: primaryPagesDir,
            handlerBinding: createTestHandlerBinding()
          }),
          createCatchAllRouteHandlersPreset({
            routeSegment: TEST_SECONDARY_ROUTE_SEGMENT,
            handlerRouteParam: {
              name: TEST_SINGLE_ROUTE_PARAM_NAME,
              kind: 'single'
            },
            contentLocaleMode: 'default-locale',
            contentPagesDir: secondaryPagesDir,
            handlerBinding: createTestHandlerBinding({
              registryImport: packageModule(TEST_SECONDARY_REGISTRY_IMPORT),
              importBase: packageModule(TEST_SECONDARY_FACTORY_IMPORT)
            })
          })
        ]
      };

      const resolvedConfigs = resolveRouteHandlersConfigBases({
        routeHandlersConfig
      });
      const fingerprint = await computePipelineFingerprintForConfigs({
        configs: resolvedConfigs,
        mode: 'generate'
      });

      const cachePath = resolvePersistentCachePath({ rootDir });
      const record: PipelineCacheRecord = {
        version: PIPELINE_CACHE_VERSION,
        fingerprint,
        emitFormat: 'ts',
        generatedAt: '2026-03-12T12:00:00.000Z',
        result: {
          analyzedCount: 2,
          heavyCount: 2,
          heavyPaths: [
            createHeavyRoute({
              targetId: TEST_PRIMARY_ROUTE_SEGMENT,
              locale: 'en',
              slugArray: ['example'],
              handlerId: 'en-example',
              handlerRelativePath: 'example/en'
            }),
            createHeavyRoute({
              targetId: TEST_SECONDARY_ROUTE_SEGMENT,
              locale: 'en',
              slugArray: ['secondary-item'],
              handlerId: 'en-secondary-item',
              handlerRelativePath: 'secondary-item'
            })
          ],
          rewrites: []
        }
      };
      await writePersistentCacheRecord({
        cachePath,
        record
      });

      const lookup = await loadRouteHandlerCacheLookup({
        routeHandlersConfig,
        targetId: TEST_PRIMARY_ROUTE_SEGMENT
      });

      expect(lookup.targetId).toBe(TEST_PRIMARY_ROUTE_SEGMENT);
      expect(lookup.isHeavyRoute('en', ['example'])).toBe(true);
      expect(lookup.isHeavyRoute('en', ['secondary-item'])).toBe(false);
    });
  });
});
