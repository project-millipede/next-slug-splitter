import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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
import { withTempDir } from '../helpers/temp-dir';

import type { ResolvedRouteHandlersConfig } from '../../next/types';

function testRemarkPlugin() {}

const writeModule = async (
  filePath: string,
  source: string
): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, source, 'utf8');
};

const createResolvedConfig = ({
  rootDir,
  processorImport,
  overrides = {}
}: {
  rootDir: string;
  processorImport: string;
  overrides?: Partial<ResolvedRouteHandlersConfig>;
}): ResolvedRouteHandlersConfig => ({
  app: {
    rootDir,
    nextConfigPath: path.join(rootDir, 'next.config.mjs'),
    routing: {
      development: 'proxy'
    }
  },
  targetId: TEST_PRIMARY_ROUTE_SEGMENT,
  localeConfig: {
    locales: ['en', 'de'],
    defaultLocale: 'en'
  },
  emitFormat: 'ts',
  contentLocaleMode: 'filename',
  handlerRouteParam: {
    name: 'slug',
    kind: 'catch-all'
  },
  runtimeHandlerFactoryImportBase: packageModule(TEST_PRIMARY_FACTORY_IMPORT),
  baseStaticPropsImport: absoluteFileModule(
    path.join(rootDir, 'pages', 'content', '[...entry].tsx')
  ),
  componentsImport: packageModule(TEST_PRIMARY_COMPONENTS_IMPORT),
  processorConfig: {
    kind: 'module',
    processorImport: absoluteFileModule(processorImport)
  },
  mdxCompileOptions: {},
  routeBasePath: '/content',
  paths: createTestPaths(rootDir),
  ...overrides
});

describe('process cache identity', () => {
  it('treats handlerRouteParam as part of the generation identity', async () => {
    await withTempDir('next-slug-splitter-process-cache-', async rootDir => {
      const processorPath = path.join(rootDir, 'processor.mjs');
      await writeModule(
        processorPath,
        'export const routeHandlerProcessor = { ingress: () => ({}), egress: () => ({ factoryVariant: "none", components: [] }) };\n'
      );

      const left = await createRouteHandlerProcessCacheIdentity({
        phase: 'phase-production-build',
        configs: [createResolvedConfig({ rootDir, processorImport: processorPath })]
      });
      const right = await createRouteHandlerProcessCacheIdentity({
        phase: 'phase-production-build',
        configs: [
          createResolvedConfig({
            rootDir,
            processorImport: processorPath,
            overrides: {
              handlerRouteParam: {
                name: 'slug',
                kind: 'single'
              }
            }
          })
        ]
      });

      expect(isSameRouteHandlerProcessCacheIdentity(left, right)).toBe(false);
    });
  });

  it('treats mdxCompileOptions as part of the generation identity', async () => {
    await withTempDir('next-slug-splitter-process-cache-', async rootDir => {
      const processorPath = path.join(rootDir, 'processor.mjs');
      await writeModule(
        processorPath,
        'export const routeHandlerProcessor = { ingress: () => ({}), egress: () => ({ factoryVariant: "none", components: [] }) };\n'
      );

      const left = await createRouteHandlerProcessCacheIdentity({
        phase: 'phase-production-build',
        configs: [createResolvedConfig({ rootDir, processorImport: processorPath })]
      });
      const right = await createRouteHandlerProcessCacheIdentity({
        phase: 'phase-production-build',
        configs: [
          createResolvedConfig({
            rootDir,
            processorImport: processorPath,
            overrides: {
              mdxCompileOptions: {
                remarkPlugins: [testRemarkPlugin]
              }
            }
          })
        ]
      });

      expect(isSameRouteHandlerProcessCacheIdentity(left, right)).toBe(false);
    });
  });

  it('treats processorImport as part of the generation identity', async () => {
    await withTempDir('next-slug-splitter-process-cache-', async rootDir => {
      const leftProcessorPath = path.join(rootDir, 'processor-a.mjs');
      const rightProcessorPath = path.join(rootDir, 'processor-b.mjs');

      await writeModule(
        leftProcessorPath,
        'export const routeHandlerProcessor = { ingress: () => ({}), egress: () => ({ factoryVariant: "none", components: [] }) };\n'
      );
      await writeModule(
        rightProcessorPath,
        'export const routeHandlerProcessor = { ingress: () => ({}), egress: () => ({ factoryVariant: "none", components: [] }) };\n'
      );

      const left = await createRouteHandlerProcessCacheIdentity({
        phase: 'phase-production-build',
        configs: [
          createResolvedConfig({
            rootDir,
            processorImport: leftProcessorPath
          })
        ]
      });
      const right = await createRouteHandlerProcessCacheIdentity({
        phase: 'phase-production-build',
        configs: [
          createResolvedConfig({
            rootDir,
            processorImport: rightProcessorPath
          })
        ]
      });

      expect(isSameRouteHandlerProcessCacheIdentity(left, right)).toBe(false);
    });
  });
});
