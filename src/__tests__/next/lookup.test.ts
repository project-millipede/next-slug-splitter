import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const captureReferencedComponentNamesMock = vi.hoisted(() =>
  vi.fn(async ({ filePath }: { filePath: string }) =>
    filePath.endsWith('/content/src/pages/example/en.mdx')
      ? ['CustomComponent']
      : []
  )
);

vi.mock('../../core/capture', () => ({
  captureReferencedComponentNames: captureReferencedComponentNamesMock
}));

import { createCatchAllRouteHandlersPreset, packageModule } from '../../next/config/index';
import { loadRouteHandlerCacheLookup } from '../../next/lookup';
import {
  TEST_CATCH_ALL_ROUTE_PARAM_NAME,
  TEST_PRIMARY_CONTENT_PAGES_DIR,
  TEST_PRIMARY_ROUTE_SEGMENT,
  TEST_SECONDARY_CONTENT_PAGES_DIR,
  TEST_SECONDARY_COMPONENTS_IMPORT,
  TEST_SECONDARY_FACTORY_IMPORT,
  TEST_SECONDARY_ROUTE_SEGMENT,
  TEST_SINGLE_ROUTE_PARAM_NAME,
  createTestHandlerBinding,
  writeTestBaseStaticPropsPage,
  writeTestModule,
  writeTestRouteHandlerPackage
} from '../helpers/fixtures';
import { withTempDir } from '../helpers/temp-dir';

import type { RouteHandlersConfig } from '../../next/types';

describe('route-handler cache lookup', () => {
  it('returns heavy-route membership scoped to one target from a fresh analyze pass', async () => {
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
      await writeTestModule(
        path.join(primaryPagesDir, 'example', 'en.mdx'),
        "import { CustomComponent } from 'test-route-handlers/primary/components';\n\n# Example\n\n<CustomComponent />\n"
      );
      await writeTestModule(
        path.join(secondaryPagesDir, 'secondary-item.mdx'),
        '# Secondary\n'
      );

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
              componentsImport: packageModule(TEST_SECONDARY_COMPONENTS_IMPORT),
              importBase: packageModule(TEST_SECONDARY_FACTORY_IMPORT)
            })
          })
        ]
      };

      const lookup = await loadRouteHandlerCacheLookup({
        routeHandlersConfig,
        nextConfig: {
          i18n: {
            locales: ['en'],
            defaultLocale: 'en'
          }
        },
        targetId: TEST_PRIMARY_ROUTE_SEGMENT
      });

      expect(captureReferencedComponentNamesMock).toHaveBeenCalled();
      expect(lookup.targetId).toBe(TEST_PRIMARY_ROUTE_SEGMENT);
      expect(lookup.isHeavyRoute('en', ['example'])).toBe(true);
      expect(lookup.isHeavyRoute('en', ['secondary-item'])).toBe(false);
    });
  });
});
