import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const captureReferencedComponentNamesMock = vi.hoisted(() =>
  vi.fn(async () => ['CustomComponent'])
);

vi.mock('../../../../core/capture', () => ({
  captureReferencedComponentNames: captureReferencedComponentNamesMock
}));

import { createCatchAllRouteHandlersPreset } from '../../../../next/config';
import { packageModule } from '../../../../next';
import { executeRouteHandlerNextPipeline } from '../../../../next/runtime';
import {
  TEST_CATCH_ALL_ROUTE_PARAM_NAME,
  TEST_PRIMARY_CONTENT_PAGES_DIR,
  TEST_PRIMARY_PROCESSOR_IMPORT,
  TEST_PRIMARY_ROUTE_SEGMENT,
  TEST_SECONDARY_CONTENT_PAGES_DIR,
  TEST_SECONDARY_PROCESSOR_IMPORT,
  TEST_SECONDARY_ROUTE_SEGMENT,
  TEST_SINGLE_ROUTE_PARAM_NAME,
  createTestHandlerBinding,
  writeTestBaseStaticPropsPage,
  writeTestModule,
  writeTestRouteHandlerPackage
} from '../../../helpers/fixtures';
import { withTempDir } from '../../../helpers/temp-dir';

import type { NextConfigLike } from '../../../../next/config/load-next-config';
import type {
  RouteHandlersConfig,
  RouteHandlersTargetConfig
} from '../../../../next/types';

const TEST_NEXT_CONFIG: NextConfigLike = {
  i18n: {
    locales: ['en'],
    defaultLocale: 'en'
  }
};

function remarkNoop() {
  return undefined;
}

const createCountedProcessorSource = (logPath: string): string =>
  [
    "import { appendFileSync } from 'node:fs';",
    `const logPath = ${JSON.stringify(logPath)};`,
    'export const routeHandlerProcessor = {',
    '  ingress({ route, capturedKeys }) {',
    "    appendFileSync(logPath, `${route.filePath}\\n`);",
    '    return Object.fromEntries(capturedKeys.map(key => [key, {}]));',
    '  },',
    '  egress({ capturedKeys }) {',
    '    return {',
    "      factoryVariant: 'none',",
    '      components: capturedKeys.map(key => ({ key }))',
    '    };',
    '  }',
    '};',
    ''
  ].join('\n');

const createHeavyPageSource = (importSource: string): string =>
  [
    `import { CustomComponent } from '${importSource}';`,
    '',
    '# Example',
    '',
    '<CustomComponent />',
    ''
  ].join('\n');

const readLogEntries = async (logPath: string): Promise<Array<string>> => {
  try {
    const raw = await readFile(logPath, 'utf8');
    return raw
      .split('\n')
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0);
  } catch {
    return [];
  }
};

const createSingleTargetConfig = ({
  rootDir,
  targetOverrides = {}
}: {
  rootDir: string;
  targetOverrides?: Partial<RouteHandlersTargetConfig>;
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
    handlerBinding: createTestHandlerBinding(),
    ...targetOverrides
  })
});

const writeSingleTargetFixture = async ({
  rootDir,
  processorLogPath
}: {
  rootDir: string;
  processorLogPath: string;
}): Promise<{
  firstRoutePath: string;
  secondRoutePath: string;
}> => {
  await writeTestRouteHandlerPackage(rootDir);
  await writeTestBaseStaticPropsPage(rootDir, {
    routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
    handlerRouteParam: {
      name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
      kind: 'catch-all'
    }
  });
  await writeTestModule(
    path.join(rootDir, 'node_modules', 'test-route-handlers', 'primary', 'processor.js'),
    createCountedProcessorSource(processorLogPath)
  );

  const firstRoutePath = path.join(
    rootDir,
    TEST_PRIMARY_CONTENT_PAGES_DIR,
    'guides',
    'en.mdx'
  );
  const secondRoutePath = path.join(
    rootDir,
    TEST_PRIMARY_CONTENT_PAGES_DIR,
    'reference',
    'en.mdx'
  );

  await writeTestModule(
    firstRoutePath,
    createHeavyPageSource('test-route-handlers/primary/components')
  );
  await writeTestModule(
    secondRoutePath,
    createHeavyPageSource('test-route-handlers/primary/components')
  );

  return {
    firstRoutePath,
    secondRoutePath
  };
};

describe('incremental target cache', () => {
  it('reuses unchanged per-file planning across repeated runs', async () => {
    await withTempDir('next-slug-splitter-incremental-cache-', async rootDir => {
      const processorLogPath = path.join(rootDir, 'processor-calls.log');
      const { firstRoutePath, secondRoutePath } = await writeSingleTargetFixture({
        rootDir,
        processorLogPath
      });
      const routeHandlersConfig = createSingleTargetConfig({
        rootDir
      });

      const firstResult = await executeRouteHandlerNextPipeline({
        routeHandlersConfig,
        nextConfig: TEST_NEXT_CONFIG,
        mode: 'generate'
      });
      const secondResult = await executeRouteHandlerNextPipeline({
        routeHandlersConfig,
        nextConfig: TEST_NEXT_CONFIG,
        mode: 'generate'
      });

      expect(firstResult.heavyCount).toBe(2);
      expect(secondResult).toEqual(firstResult);
      expect(await readLogEntries(processorLogPath)).toEqual([
        firstRoutePath,
        secondRoutePath
      ]);
    });
  });

  it('recomputes only changed routes within one target', async () => {
    await withTempDir('next-slug-splitter-incremental-cache-', async rootDir => {
      const processorLogPath = path.join(rootDir, 'processor-calls.log');
      const { firstRoutePath, secondRoutePath } = await writeSingleTargetFixture({
        rootDir,
        processorLogPath
      });
      const routeHandlersConfig = createSingleTargetConfig({
        rootDir
      });

      await executeRouteHandlerNextPipeline({
        routeHandlersConfig,
        nextConfig: TEST_NEXT_CONFIG,
        mode: 'generate'
      });

      await writeFile(
        firstRoutePath,
        createHeavyPageSource('test-route-handlers/primary/components').replace(
          '# Example',
          '# Updated Example'
        ),
        'utf8'
      );

      const secondResult = await executeRouteHandlerNextPipeline({
        routeHandlersConfig,
        nextConfig: TEST_NEXT_CONFIG,
        mode: 'generate'
      });
      const logEntries = await readLogEntries(processorLogPath);

      expect(secondResult.heavyCount).toBe(2);
      expect(logEntries.filter(entry => entry === firstRoutePath)).toHaveLength(2);
      expect(logEntries.filter(entry => entry === secondRoutePath)).toHaveLength(1);
    });
  });

  it('invalidates the target snapshot when mdxCompileOptions identity changes', async () => {
    await withTempDir('next-slug-splitter-incremental-cache-', async rootDir => {
      const processorLogPath = path.join(rootDir, 'processor-calls.log');
      const { firstRoutePath, secondRoutePath } = await writeSingleTargetFixture({
        rootDir,
        processorLogPath
      });

      const baseConfig = createSingleTargetConfig({
        rootDir
      });
      await executeRouteHandlerNextPipeline({
        routeHandlersConfig: baseConfig,
        nextConfig: TEST_NEXT_CONFIG,
        mode: 'generate'
      });

      const invalidatedConfig = createSingleTargetConfig({
        rootDir,
        targetOverrides: {
          mdxCompileOptions: {
            remarkPlugins: [remarkNoop]
          }
        }
      });
      await executeRouteHandlerNextPipeline({
        routeHandlersConfig: invalidatedConfig,
        nextConfig: TEST_NEXT_CONFIG,
        mode: 'generate'
      });

      expect(await readLogEntries(processorLogPath)).toEqual([
        firstRoutePath,
        secondRoutePath,
        firstRoutePath,
        secondRoutePath
      ]);
    });
  });

  it('keeps unchanged targets cached when another target changes', async () => {
    await withTempDir('next-slug-splitter-incremental-cache-', async rootDir => {
      const primaryLogPath = path.join(rootDir, 'primary-processor.log');
      const secondaryLogPath = path.join(rootDir, 'secondary-processor.log');

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
        path.join(rootDir, 'node_modules', 'test-route-handlers', 'primary', 'processor.js'),
        createCountedProcessorSource(primaryLogPath)
      );
      await writeTestModule(
        path.join(rootDir, 'node_modules', 'test-route-handlers', 'secondary', 'processor.js'),
        createCountedProcessorSource(secondaryLogPath)
      );

      const primaryRoutePath = path.join(
        rootDir,
        TEST_PRIMARY_CONTENT_PAGES_DIR,
        'docs',
        'en.mdx'
      );
      const secondaryRoutePath = path.join(
        rootDir,
        TEST_SECONDARY_CONTENT_PAGES_DIR,
        'blog-post.mdx'
      );

      await writeTestModule(
        primaryRoutePath,
        createHeavyPageSource('test-route-handlers/primary/components')
      );
      await writeTestModule(
        secondaryRoutePath,
        createHeavyPageSource('test-route-handlers/secondary/components')
      );

      const routeHandlersConfig: RouteHandlersConfig = {
        app: {
          rootDir,
          nextConfigPath: path.join(rootDir, 'next.config.mjs')
        },
        targets: [
          createCatchAllRouteHandlersPreset({
            routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
            handlerRouteParam: {
              name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
              kind: 'catch-all'
            },
            contentPagesDir: path.join(rootDir, TEST_PRIMARY_CONTENT_PAGES_DIR),
            handlerBinding: createTestHandlerBinding({
              processorImport: packageModule(TEST_PRIMARY_PROCESSOR_IMPORT)
            })
          }),
          createCatchAllRouteHandlersPreset({
            routeSegment: TEST_SECONDARY_ROUTE_SEGMENT,
            handlerRouteParam: {
              name: TEST_SINGLE_ROUTE_PARAM_NAME,
              kind: 'single'
            },
            contentPagesDir: path.join(rootDir, TEST_SECONDARY_CONTENT_PAGES_DIR),
            contentLocaleMode: 'default-locale',
            handlerBinding: createTestHandlerBinding({
              componentsImport: packageModule('test-route-handlers/secondary/components'),
              importBase: packageModule('test-route-handlers/secondary/factory'),
              processorImport: packageModule(TEST_SECONDARY_PROCESSOR_IMPORT)
            })
          })
        ]
      };

      await executeRouteHandlerNextPipeline({
        routeHandlersConfig,
        nextConfig: TEST_NEXT_CONFIG,
        mode: 'generate'
      });

      await writeFile(
        primaryRoutePath,
        createHeavyPageSource('test-route-handlers/primary/components').replace(
          '# Example',
          '# Docs Updated'
        ),
        'utf8'
      );

      const secondResult = await executeRouteHandlerNextPipeline({
        routeHandlersConfig,
        nextConfig: TEST_NEXT_CONFIG,
        mode: 'generate'
      });

      expect(secondResult.heavyCount).toBe(2);
      expect(await readLogEntries(primaryLogPath)).toEqual([
        primaryRoutePath,
        primaryRoutePath
      ]);
      expect(await readLogEntries(secondaryLogPath)).toEqual([secondaryRoutePath]);
    });
  });
});
