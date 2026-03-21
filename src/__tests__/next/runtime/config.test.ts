import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createCatchAllRouteHandlersPreset } from '../../../next/config';
import { loadResolvedRouteHandlersConfigs } from '../../../next/runtime/config';
import {
  TEST_CATCH_ALL_ROUTE_PARAM_NAME,
  TEST_PRIMARY_CONTENT_PAGES_DIR,
  TEST_PRIMARY_ROUTE_SEGMENT,
  createTestHandlerBinding,
  writeTestBaseStaticPropsPage,
  writeTestRouteHandlerPackage
} from '../../helpers/fixtures';
import { withTempDir } from '../../helpers/temp-dir';

import type { RouteHandlersConfig } from '../../../next/types';

describe('runtime config loading', () => {
  it('uses the provided nextConfig object without loading app.nextConfigPath', async () => {
    await withTempDir('next-slug-splitter-runtime-config-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);
      await writeTestBaseStaticPropsPage(rootDir, {
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        }
      });

      const routeHandlersConfig: RouteHandlersConfig = {
        app: {
          rootDir,
          nextConfigPath: path.join(rootDir, 'missing-next.config.mjs')
        },
        ...createCatchAllRouteHandlersPreset({
          routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
          handlerRouteParam: {
            name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
            kind: 'catch-all'
          },
          contentPagesDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
          handlerBinding: createTestHandlerBinding()
        })
      };

      const [resolvedConfig] = await loadResolvedRouteHandlersConfigs({
        routeHandlersConfig,
        nextConfig: {
          i18n: {
            locales: ['en', 'de'],
            defaultLocale: 'en'
          }
        }
      });

      expect(resolvedConfig.localeConfig).toEqual({
        locales: ['en', 'de'],
        defaultLocale: 'en'
      });
    });
  });

  it('loads the next config from app.nextConfigPath when nextConfig is not provided', async () => {
    await withTempDir('next-slug-splitter-runtime-config-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);
      await writeTestBaseStaticPropsPage(rootDir, {
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        }
      });

      const nextConfigPath = path.join(rootDir, 'next.config.mjs');
      await writeFile(
        nextConfigPath,
        [
          'export default {',
          '  i18n: {',
          "    locales: ['en', 'fr'],",
          "    defaultLocale: 'fr'",
          '  }',
          '};',
          ''
        ].join('\n'),
        'utf8'
      );

      const routeHandlersConfig: RouteHandlersConfig = {
        app: {
          rootDir,
          nextConfigPath
        },
        ...createCatchAllRouteHandlersPreset({
          routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
          handlerRouteParam: {
            name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
            kind: 'catch-all'
          },
          contentPagesDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
          handlerBinding: createTestHandlerBinding()
        })
      };

      const [resolvedConfig] = await loadResolvedRouteHandlersConfigs({
        routeHandlersConfig
      });

      expect(resolvedConfig.localeConfig).toEqual({
        locales: ['en', 'fr'],
        defaultLocale: 'fr'
      });
    });
  });
});
