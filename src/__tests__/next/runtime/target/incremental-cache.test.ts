import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const captureRouteHandlerComponentGraphMock = vi.hoisted(() =>
  vi.fn(async (filePath: string) => ({
    usedComponentNames: ['CustomComponent'],
    transitiveModulePaths: []
  }))
);

vi.mock(import('../../../../core/capture'), () => ({
  captureRouteHandlerComponentGraph: captureRouteHandlerComponentGraphMock
}));

import { createCatchAllRouteHandlersPreset } from '../../../../next/config';
import { executeRouteHandlerNextPipeline } from '../../../../next/shared/runtime';
import {
  TEST_CATCH_ALL_ROUTE_PARAM_NAME,
  TEST_PRIMARY_CONTENT_PAGES_DIR,
  TEST_PRIMARY_ROUTE_SEGMENT,
  createTestHandlerBinding,
  writeTestBaseStaticPropsPage,
  writeTestModule,
  writeTestRouteHandlerPackage
} from '../../../helpers/fixtures';
import { withTempDir } from '../../../helpers/temp-dir';

import type { LocaleConfig } from '../../../../core/types';
import type {
  RouteHandlersConfig,
  RouteHandlersTargetConfig
} from '../../../../next/shared/types';

const TEST_LOCALE_CONFIG: LocaleConfig = {
  locales: ['en'],
  defaultLocale: 'en'
};

const createCountedProcessorSource = (logPath: string): string =>
  [
    "import { appendFileSync } from 'node:fs';",
    `const logPath = ${JSON.stringify(logPath)};`,
    'export const routeHandlerProcessor = {',
    '  resolve({ route, capturedComponentKeys }) {',
    '    appendFileSync(logPath, `${route.filePath}\\n`);',
    '    return {',
    "      factoryImport: { kind: 'package', specifier: 'none' },",
    "      components: capturedComponentKeys.map(key => ({ key, componentImport: { source: { kind: 'package', specifier: './components' }, kind: 'named', importedName: key } }))",
    '    };',
    '  }',
    '};',
    ''
  ].join('\n');

const createHeavyPageSource = (): string =>
  [
    "import { CustomComponent } from 'test-route-handlers/primary/components';",
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
    rootDir
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
    path.join(
      rootDir,
      'node_modules',
      'test-route-handlers',
      'primary',
      'processor.js'
    ),
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

  await writeTestModule(firstRoutePath, createHeavyPageSource());
  await writeTestModule(secondRoutePath, createHeavyPageSource());

  return {
    firstRoutePath,
    secondRoutePath
  };
};

describe('fresh target execution', () => {
  it('reanalyzes all routes on every generate run', async () => {
    await withTempDir('next-slug-splitter-fresh-target-', async rootDir => {
      const processorLogPath = path.join(rootDir, 'processor-calls.log');
      const { firstRoutePath, secondRoutePath } =
        await writeSingleTargetFixture({
          rootDir,
          processorLogPath
        });
      const routeHandlersConfig = createSingleTargetConfig({
        rootDir
      });

      const firstResult = await executeRouteHandlerNextPipeline({
        routeHandlersConfig,
        localeConfig: TEST_LOCALE_CONFIG,
        mode: 'generate'
      });

      const secondResult = await executeRouteHandlerNextPipeline({
        routeHandlersConfig,
        localeConfig: TEST_LOCALE_CONFIG,
        mode: 'generate'
      });

      expect(firstResult[0].heavyCount).toBe(2);
      expect(secondResult).toEqual(firstResult);
      expect(await readLogEntries(processorLogPath)).toEqual([
        firstRoutePath,
        secondRoutePath,
        firstRoutePath,
        secondRoutePath
      ]);
    });
  });

  it('reanalyzes every route again even when only one file changed', async () => {
    await withTempDir('next-slug-splitter-fresh-target-', async rootDir => {
      const processorLogPath = path.join(rootDir, 'processor-calls.log');
      const { firstRoutePath, secondRoutePath } =
        await writeSingleTargetFixture({
          rootDir,
          processorLogPath
        });
      const routeHandlersConfig = createSingleTargetConfig({
        rootDir
      });

      await executeRouteHandlerNextPipeline({
        routeHandlersConfig,
        localeConfig: TEST_LOCALE_CONFIG,
        mode: 'generate'
      });

      await writeFile(
        firstRoutePath,
        createHeavyPageSource().replace('# Example', '# Updated Example'),
        'utf8'
      );

      const secondResult = await executeRouteHandlerNextPipeline({
        routeHandlersConfig,
        localeConfig: TEST_LOCALE_CONFIG,
        mode: 'generate'
      });

      expect(secondResult[0].heavyCount).toBe(2);
      expect(await readLogEntries(processorLogPath)).toEqual([
        firstRoutePath,
        secondRoutePath,
        firstRoutePath,
        secondRoutePath
      ]);
    });
  });
});
