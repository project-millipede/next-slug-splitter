import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  createRouteContext,
  createRouteHandlerRoutePlanner
} from '../../core/processor-runner';
import { absoluteModule, packageModule } from '../../module-reference';
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
          '  resolve({ capturedComponentKeys, route }) {',
          '    const resolvedEntries = Object.fromEntries(',
          '      capturedComponentKeys.map((key, index) => [key, { index, routePath: route.routePath }])',
          '    );',
          '    return {',
          '      factoryImport: { kind: "package", specifier: "selection" },',
          '      components: capturedComponentKeys.map(key => ({',
          '        key,',
          '        componentImport: { source: { kind: "package", specifier: "./components" }, kind: "named", importedName: key },',
          '        metadata: {',
          '          routePath: resolvedEntries[key].routePath,',
          '          order: resolvedEntries[key].index,',
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
        processorConfig: {
          kind: 'module',
          processorImport: absoluteModule(processorPath)
        }
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
        capturedComponentKeys: ['SelectionComponent']
      });

      expect(result.factoryImport).toEqual(packageModule('selection'));
      expect(result.componentEntries).toEqual([
        {
          key: 'SelectionComponent',
          componentImport: {
            source: packageModule('./components'),
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
          '  resolve() { return { factoryImport: { kind: "package", specifier: "none" }, components: [] }; }',
          '};',
          ''
        ].join('\n')
      );

      await expect(
        createRouteHandlerRoutePlanner({
          rootDir,
          processorConfig: {
            kind: 'module',
            processorImport: absoluteModule(processorPath)
          }
        })
      ).rejects.toThrow(
        `Processor module "${processorPath}" must resolve to a native JavaScript module (.js, .mjs, or .cjs).`
      );
    });
  });

  it('rejects legacy two-phase processors with a targeted migration error', async () => {
    await withTempDir('next-slug-splitter-processor-', async rootDir => {
      const processorPath = path.join(rootDir, 'processor.mjs');

      await writeFactoryVariant(rootDir, 'none');
      await writeTestModule(
        processorPath,
        [
          'export const routeHandlerProcessor = {',
          '  resolve() { return {}; },',
          '  plan() { return { factoryImport: { kind: "package", specifier: "none" }, components: [] }; }',
          '};',
          ''
        ].join('\n')
      );

      await expect(
        createRouteHandlerRoutePlanner({
          rootDir,
          processorConfig: {
            kind: 'module',
            processorImport: absoluteModule(processorPath)
          }
        })
      ).rejects.toThrow(
        `processor module "${processorPath}" still uses the removed two-phase processor API. Remove plan(...) and have resolve(...) return the final RouteHandlerGeneratorPlan.`
      );
    });
  });

  it('rejects processor modules without a resolve function', async () => {
    await withTempDir('next-slug-splitter-processor-', async rootDir => {
      const processorPath = path.join(rootDir, 'processor.mjs');

      await writeFactoryVariant(rootDir, 'none');
      await writeTestModule(
        processorPath,
        [
          'export const routeHandlerProcessor = {',
          '  factoryImport: { kind: "package", specifier: "none" }',
          '};',
          ''
        ].join('\n')
      );

      await expect(
        createRouteHandlerRoutePlanner({
          rootDir,
          processorConfig: {
            kind: 'module',
            processorImport: absoluteModule(processorPath)
          }
        })
      ).rejects.toThrow(
        `processor module "${processorPath}".resolve must be a function.`
      );
    });
  });

  it('rejects missing captured component plans from processor resolve', async () => {
    await withTempDir('next-slug-splitter-processor-', async rootDir => {
      const processorPath = path.join(rootDir, 'processor.mjs');

      await writeFactoryVariant(rootDir, 'none');
      await writeTestModule(
        processorPath,
        [
          'export const routeHandlerProcessor = {',
          '  resolve() {',
          '    return {',
          '      factoryImport: { kind: "package", specifier: "none" },',
          '      components: [{ key: "KnownComponent", componentImport: { source: { kind: "package", specifier: "./components" }, kind: "named", importedName: "KnownComponent" } }]',
          '    };',
          '  }',
          '};',
          ''
        ].join('\n')
      );

      const planner = await createRouteHandlerRoutePlanner({
        rootDir,
        processorConfig: {
          kind: 'module',
          processorImport: absoluteModule(processorPath)
        }
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
          capturedComponentKeys: ['KnownComponent', 'MissingComponent']
        })
      ).rejects.toThrow(
        'Processor for target "docs", route "/docs/missing", handler "en-missing" is missing captured component key "MissingComponent".'
      );
    });
  });

  it('rejects non-serializable processor metadata', async () => {
    await withTempDir('next-slug-splitter-processor-', async rootDir => {
      const processorPath = path.join(rootDir, 'processor.mjs');

      await writeFactoryVariant(rootDir, 'none');
      await writeTestModule(
        processorPath,
        [
          'export const routeHandlerProcessor = {',
          '  resolve() {',
          '    return {',
          '      factoryImport: { kind: "package", specifier: "none" },',
          '      components: [{',
          '        key: "BrokenComponent",',
          '        componentImport: { source: { kind: "package", specifier: "./components" }, kind: "named", importedName: "BrokenComponent" },',
          '        metadata: { bad: () => null }',
          '      }]',
          '    };',
          '  }',
          '};',
          ''
        ].join('\n')
      );

      const planner = await createRouteHandlerRoutePlanner({
        rootDir,
        processorConfig: {
          kind: 'module',
          processorImport: absoluteModule(processorPath)
        }
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
          capturedComponentKeys: ['BrokenComponent']
        })
      ).rejects.toThrow(
        'Component "BrokenComponent" for target "docs", route "/docs/broken", handler "en-broken".metadata must be a JSON-serializable object when provided.'
      );
    });
  });
});
