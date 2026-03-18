import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  createRouteContext,
  createRouteHandlerRoutePlanner,
  resolveRouteHandlerProcessorCacheInfo
} from '../../core/processor-runner';
import { absoluteFileModule } from '../../module-reference';
import { writeTestModule } from '../helpers/fixtures';
import { withTempDir } from '../helpers/temp-dir';

const writeFactoryVariant = async (
  rootDir: string,
  variant: string
): Promise<void> => {
  await writeTestModule(
    path.join(rootDir, 'factory', `${variant}.mjs`),
    'export const createHandlerPage = input => input;\n'
  );
};

describe('processor runner', () => {
  it('creates route-local component plans from a module-backed processor', async () => {
    await withTempDir('next-slug-splitter-processor-', async rootDir => {
      const componentsPath = path.join(rootDir, 'components.mjs');
      const processorPath = path.join(rootDir, 'processor.mjs');

      await writeTestModule(componentsPath, 'export const SelectionComponent = () => null;\n');
      await writeFactoryVariant(rootDir, 'selection');
      await writeTestModule(
        processorPath,
        [
          'export const routeHandlerProcessor = {',
          '  ingress({ capturedKeys, route }) {',
          '    return Object.fromEntries(',
          '      capturedKeys.map((key, index) => [key, { index, routePath: route.routePath }])',
          '    );',
          '  },',
          '  egress({ capturedKeys, resolved }) {',
          '    return {',
          '      factoryVariant: "selection",',
          '      components: capturedKeys.map(key => ({',
          '        key,',
          '        metadata: {',
          '          routePath: resolved[key].routePath,',
          '          order: resolved[key].index,',
          '          runtimeTraits: ["selection"]',
          '        }',
          '      }))',
          '    };',
          '  }',
          '};',
          ''
        ].join('\n')
      );

      const planner = await createRouteHandlerRoutePlanner({
        rootDir,
        componentsImport: absoluteFileModule(componentsPath),
        processorConfig: {
          kind: 'module',
          processorImport: absoluteFileModule(processorPath)
        },
        runtimeHandlerFactoryImportBase: absoluteFileModule(
          path.join(rootDir, 'factory')
        )
      });

      const result = await planner({
        route: createRouteContext({
          filePath: path.join(rootDir, 'docs', 'selection.mdx'),
          handlerId: 'en-selection',
          handlerRelativePath: 'selection/en',
          locale: 'en',
          routeBasePath: '/docs',
          slugArray: ['selection'],
          targetId: 'docs'
        }),
        capturedKeys: ['SelectionComponent']
      });

      expect(result.factoryVariant).toBe('selection');
      expect(result.componentEntries).toEqual([
        {
          key: 'SelectionComponent',
          componentImport: {
            source: componentsPath,
            kind: 'named',
            importedName: 'SelectionComponent'
          },
          metadata: {
            routePath: '/docs/selection',
            order: 0,
            runtimeTraits: ['selection']
          }
        }
      ]);
    });
  });

  it('rejects processor modules that do not resolve to native JavaScript', async () => {
    await withTempDir('next-slug-splitter-processor-', async rootDir => {
      const processorPath = path.join(rootDir, 'processor.ts');

      await writeFactoryVariant(rootDir, 'none');
      await writeTestModule(
        processorPath,
        [
          'export const routeHandlerProcessor = {',
          '  ingress() { return {}; },',
          '  egress() { return { factoryVariant: "none", components: [] }; }',
          '};',
          ''
        ].join('\n')
      );

      await expect(
        createRouteHandlerRoutePlanner({
          rootDir,
          componentsImport: absoluteFileModule(
            path.join(rootDir, 'components.mjs')
          ),
          processorConfig: {
            kind: 'module',
            processorImport: absoluteFileModule(processorPath)
          },
          runtimeHandlerFactoryImportBase: absoluteFileModule(
            path.join(rootDir, 'factory')
          )
        })
      ).rejects.toThrow(
        `Processor module "${processorPath}" must resolve to a native JavaScript module (.js, .mjs, or .cjs).`
      );
    });
  });

  it('rejects missing captured component plans from processor egress', async () => {
    await withTempDir('next-slug-splitter-processor-', async rootDir => {
      const processorPath = path.join(rootDir, 'processor.mjs');

      await writeFactoryVariant(rootDir, 'none');
      await writeTestModule(
        processorPath,
        [
          'export const routeHandlerProcessor = {',
          '  ingress() {',
          '    return {};',
          '  },',
          '  egress() {',
          '    return {',
          '      factoryVariant: "none",',
          '      components: [{ key: "KnownComponent" }]',
          '    };',
          '  }',
          '};',
          ''
        ].join('\n')
      );

      const planner = await createRouteHandlerRoutePlanner({
        rootDir,
        componentsImport: absoluteFileModule(path.join(rootDir, 'components.mjs')),
        processorConfig: {
          kind: 'module',
          processorImport: absoluteFileModule(processorPath)
        },
        runtimeHandlerFactoryImportBase: absoluteFileModule(
          path.join(rootDir, 'factory')
        )
      });

      await expect(
        planner({
          route: createRouteContext({
            filePath: path.join(rootDir, 'docs', 'missing.mdx'),
            handlerId: 'en-missing',
            handlerRelativePath: 'missing/en',
            locale: 'en',
            routeBasePath: '/docs',
            slugArray: ['missing'],
            targetId: 'docs'
          }),
          capturedKeys: ['KnownComponent', 'MissingComponent']
        })
      ).rejects.toThrow(
        'Processor for target "docs", route "/docs/missing", handler "en-missing" is missing captured component key "MissingComponent".'
      );
    });
  });

  it('rejects non-serializable processor metadata and exposes cache inputs', async () => {
    await withTempDir('next-slug-splitter-processor-', async rootDir => {
      const metadataPath = path.join(rootDir, 'metadata.mjs');
      const processorPath = path.join(rootDir, 'processor.mjs');

      await writeTestModule(metadataPath, 'export const metadata = {};\n');
      await writeFactoryVariant(rootDir, 'none');
      await writeTestModule(
        processorPath,
        [
          `const metadataPath = ${JSON.stringify(metadataPath)};`,
          'export const routeHandlerProcessor = {',
          '  cache: {',
          '    inputImports: [{ kind: "absolute-file", path: metadataPath }],',
          '    getIdentity: ({ targetId }) => `processor:${targetId ?? "none"}`',
          '  },',
          '  ingress() {',
          '    return {};',
          '  },',
          '  egress() {',
          '    return {',
          '      factoryVariant: "none",',
          '      components: [{',
          '        key: "BrokenComponent",',
          '        metadata: { bad: () => null }',
          '      }]',
          '    };',
          '  }',
          '};',
          ''
        ].join('\n')
      );

      const cacheInfo = await resolveRouteHandlerProcessorCacheInfo({
        rootDir,
        processorConfig: {
          kind: 'module',
          processorImport: absoluteFileModule(processorPath)
        },
        targetId: 'docs'
      });

      expect(cacheInfo).toEqual({
        inputImports: [absoluteFileModule(metadataPath)],
        identity: 'processor:docs'
      });

      const planner = await createRouteHandlerRoutePlanner({
        rootDir,
        componentsImport: absoluteFileModule(path.join(rootDir, 'components.mjs')),
        processorConfig: {
          kind: 'module',
          processorImport: absoluteFileModule(processorPath)
        },
        runtimeHandlerFactoryImportBase: absoluteFileModule(
          path.join(rootDir, 'factory')
        )
      });

      await expect(
        planner({
          route: createRouteContext({
            filePath: path.join(rootDir, 'docs', 'broken.mdx'),
            handlerId: 'en-broken',
            handlerRelativePath: 'broken/en',
            locale: 'en',
            routeBasePath: '/docs',
            slugArray: ['broken'],
            targetId: 'docs'
          }),
          capturedKeys: ['BrokenComponent']
        })
      ).rejects.toThrow(
        'Component "BrokenComponent" for target "docs", route "/docs/broken", handler "en-broken".metadata must be a JSON-serializable object when provided.'
      );
    });
  });
});
