import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { absoluteModule, relativeModule } from '../../../module-reference';
import { resolveRouteHandlersConfig } from '../../../next/config/resolve-configs';
import {
  TEST_CATCH_ALL_ROUTE_PARAM_NAME,
  TEST_PRIMARY_CONTENT_PAGES_DIR,
  TEST_PRIMARY_ROUTE_SEGMENT,
  createTestHandlerBinding,
  writeTestBaseStaticPropsPage,
  writeTestRouteHandlerPackage
} from '../../helpers/fixtures';
import { withTempDir } from '../../helpers/temp-dir';

describe('next config resolution', () => {
  it('resolves handlerBinding.processorImport from the app root', async () => {
    await withTempDir('next-slug-splitter-config-resolution-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);
      await writeTestBaseStaticPropsPage(rootDir, {
        routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
        handlerRouteParam: {
          name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
          kind: 'catch-all'
        }
      });
      await mkdir(path.join(rootDir, 'src'), { recursive: true });
      await writeFile(
        path.join(rootDir, 'src', 'route-handler-processor.mjs'),
        'export const routeHandlerProcessor = { resolve: () => ({ factoryImport: { kind: "package", specifier: "none" }, components: [] }) };\n',
        'utf8'
      );

      const resolvedConfig = resolveRouteHandlersConfig({
        rootDir,
        localeConfig: {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        },
        routeHandlersConfig: {
          app: {
            rootDir
          },
          targetId: TEST_PRIMARY_ROUTE_SEGMENT,
          routeBasePath: '/content',
          paths: {
            contentPagesDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
            handlersDir: path.join('pages', 'content', '_handlers')
          },
          emitFormat: 'ts',
          contentLocaleMode: 'filename',
          handlerRouteParam: {
            name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
            kind: 'catch-all'
          },
          baseStaticPropsImport: relativeModule('pages/content/[...entry]'),
          handlerBinding: {
            processorImport: relativeModule('src/route-handler-processor.mjs')
          },
          mdxCompileOptions: {}
        }
      });

      expect(resolvedConfig.processorConfig).toEqual({
        kind: 'module',
        processorImport: absoluteModule(
          path.join(rootDir, 'src', 'route-handler-processor.mjs')
        )
      });
      expect(resolvedConfig.baseStaticPropsImport).toEqual(
        absoluteModule(path.join(rootDir, 'pages', 'content', '[...entry]'))
      );
    });
  });

  it('rejects a target whose baseStaticPropsImport cannot be resolved on disk', async () => {
    await withTempDir('next-slug-splitter-config-resolution-', async rootDir => {
      await writeTestRouteHandlerPackage(rootDir);

      expect(() =>
        resolveRouteHandlersConfig({
          rootDir,
          localeConfig: {
            locales: ['en', 'de'],
            defaultLocale: 'en'
          },
          routeHandlersConfig: {
            app: {
              rootDir
            },
            targetId: TEST_PRIMARY_ROUTE_SEGMENT,
            routeBasePath: '/content',
            paths: {
              contentPagesDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
              handlersDir: path.join('pages', 'content', '_handlers')
            },
            emitFormat: 'ts',
            contentLocaleMode: 'filename',
            handlerRouteParam: {
              name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
              kind: 'catch-all'
            },
            baseStaticPropsImport: relativeModule('pages/content/[...entry]'),
            handlerBinding: createTestHandlerBinding(),
            mdxCompileOptions: {}
          }
        })
      ).toThrow(
        `[next-slug-splitter] baseStaticPropsImport could not be resolved from "${rootDir}".`
      );
    });
  });
});
