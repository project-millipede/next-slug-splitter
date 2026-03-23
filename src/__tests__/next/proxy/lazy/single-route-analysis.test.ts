import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureReferencedComponentNamesMock = vi.hoisted(() => vi.fn());
const loadRegisteredSlugSplitterConfigMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../core/capture', () => ({
  captureReferencedComponentNames: captureReferencedComponentNamesMock
}));

vi.mock('../../../../next/integration/slug-splitter-config-loader', () => ({
  loadRegisteredSlugSplitterConfig: loadRegisteredSlugSplitterConfigMock
}));

import { createCatchAllRouteHandlersPreset } from '../../../../next/config';
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
import { resolveRouteHandlerLazyRequest } from '../../../../next/proxy/lazy/request-resolution';
import { analyzeRouteHandlerLazyMatchedRoute } from '../../../../next/proxy/lazy/single-route-analysis';

import type {
  RouteHandlersConfig,
  RouteHandlersTargetConfig
} from '../../../../next/types';

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

describe('proxy lazy single-route analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('analyzes one matched route file once and reuses the cached heavy result on later calls', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-single-route-',
      async rootDir => {
        const processorLogPath = path.join(rootDir, 'processor-calls.log');
        const routeHandlersConfig = createSingleTargetConfig({
          rootDir
        });
        const routeFilePath = path.join(
          rootDir,
          TEST_PRIMARY_CONTENT_PAGES_DIR,
          'guides',
          'en.mdx'
        );

        captureReferencedComponentNamesMock.mockResolvedValue(['CustomComponent']);
        await writeTestRouteHandlerPackage(rootDir);
        await writeTestBaseStaticPropsPage(rootDir, {
          routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
          handlerRouteParam: {
            name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
            kind: 'catch-all'
          }
        });
        await writeTestModule(
          path.join(rootDir, 'next.config.mjs'),
          'export default {};\n'
        );
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
        await writeTestModule(routeFilePath, '# Guides\n');
        loadRegisteredSlugSplitterConfigMock.mockResolvedValue(routeHandlersConfig);

        const resolution = await resolveRouteHandlerLazyRequest({
          pathname: '/content/guides',
          localeConfig: {
            locales: ['en'],
            defaultLocale: 'en'
          }
        });

        expect(resolution.kind).toBe('matched-route-file');
        if (resolution.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        const firstResult = await analyzeRouteHandlerLazyMatchedRoute(
          resolution.config.targetId,
          resolution.config.localeConfig,
          resolution.routePath
        );
        const secondResult = await analyzeRouteHandlerLazyMatchedRoute(
          resolution.config.targetId,
          resolution.config.localeConfig,
          resolution.routePath
        );

        expect(firstResult?.kind).toBe('heavy');
        expect(firstResult?.source).toBe('fresh');
        expect(secondResult?.kind).toBe('heavy');
        expect(secondResult?.source).toBe('cache');
        expect(await readLogEntries(processorLogPath)).toEqual([routeFilePath]);
      }
    );
  });

  it('caches light single-route results without invoking the processor', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-single-route-',
      async rootDir => {
        const processorLogPath = path.join(rootDir, 'processor-calls.log');
        const routeHandlersConfig = createSingleTargetConfig({
          rootDir
        });
        const routeFilePath = path.join(
          rootDir,
          TEST_PRIMARY_CONTENT_PAGES_DIR,
          'guides',
          'en.mdx'
        );

        captureReferencedComponentNamesMock.mockResolvedValue([]);
        await writeTestRouteHandlerPackage(rootDir);
        await writeTestBaseStaticPropsPage(rootDir, {
          routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
          handlerRouteParam: {
            name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
            kind: 'catch-all'
          }
        });
        await writeTestModule(
          path.join(rootDir, 'next.config.mjs'),
          'export default {};\n'
        );
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
        await writeTestModule(routeFilePath, '# Guides\n');
        loadRegisteredSlugSplitterConfigMock.mockResolvedValue(routeHandlersConfig);

        const resolution = await resolveRouteHandlerLazyRequest({
          pathname: '/content/guides',
          localeConfig: {
            locales: ['en'],
            defaultLocale: 'en'
          }
        });

        expect(resolution.kind).toBe('matched-route-file');
        if (resolution.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        const firstResult = await analyzeRouteHandlerLazyMatchedRoute(
          resolution.config.targetId,
          resolution.config.localeConfig,
          resolution.routePath
        );
        const secondResult = await analyzeRouteHandlerLazyMatchedRoute(
          resolution.config.targetId,
          resolution.config.localeConfig,
          resolution.routePath
        );

        expect(firstResult?.kind).toBe('light');
        expect(firstResult?.source).toBe('fresh');
        expect(secondResult?.kind).toBe('light');
        expect(secondResult?.source).toBe('cache');
        expect(await readLogEntries(processorLogPath)).toEqual([]);
      }
    );
  });

  it('invalidates the lazy single-route cache when the target static identity changes', async () => {
    await withTempDir(
      'next-slug-splitter-proxy-lazy-single-route-',
      async rootDir => {
        const processorLogPath = path.join(rootDir, 'processor-calls.log');
        const baseConfig = createSingleTargetConfig({
          rootDir
        });
        const invalidatedConfig = createSingleTargetConfig({
          rootDir,
          targetOverrides: {
            mdxCompileOptions: {
              remarkPlugins: [remarkNoop]
            }
          }
        });
        const routeFilePath = path.join(
          rootDir,
          TEST_PRIMARY_CONTENT_PAGES_DIR,
          'guides',
          'en.mdx'
        );

        captureReferencedComponentNamesMock.mockResolvedValue(['CustomComponent']);
        await writeTestRouteHandlerPackage(rootDir);
        await writeTestBaseStaticPropsPage(rootDir, {
          routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
          handlerRouteParam: {
            name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
            kind: 'catch-all'
          }
        });
        await writeTestModule(
          path.join(rootDir, 'next.config.mjs'),
          'export default {};\n'
        );
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
        await writeTestModule(routeFilePath, '# Guides\n');
        loadRegisteredSlugSplitterConfigMock.mockResolvedValue(baseConfig);

        const firstResolution = await resolveRouteHandlerLazyRequest({
          pathname: '/content/guides',
          localeConfig: {
            locales: ['en'],
            defaultLocale: 'en'
          }
        });
        if (firstResolution.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        await analyzeRouteHandlerLazyMatchedRoute(
          firstResolution.config.targetId,
          firstResolution.config.localeConfig,
          firstResolution.routePath
        );

        loadRegisteredSlugSplitterConfigMock.mockResolvedValue(invalidatedConfig);

        const secondResolution = await resolveRouteHandlerLazyRequest({
          pathname: '/content/guides',
          localeConfig: {
            locales: ['en'],
            defaultLocale: 'en'
          }
        });
        if (secondResolution.kind !== 'matched-route-file') {
          throw new Error('Expected matched-route-file resolution.');
        }

        const secondResult = await analyzeRouteHandlerLazyMatchedRoute(
          secondResolution.config.targetId,
          secondResolution.config.localeConfig,
          secondResolution.routePath
        );

        expect(secondResult?.kind).toBe('heavy');
        expect(secondResult?.source).toBe('fresh');
        expect(await readLogEntries(processorLogPath)).toEqual([
          routeFilePath,
          routeFilePath
        ]);
      }
    );
  });
});
