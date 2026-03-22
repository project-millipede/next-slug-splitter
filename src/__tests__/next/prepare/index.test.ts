import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

import {
  appRelativeModule,
  createCatchAllRouteHandlersPreset,
  packageModule
} from '../../../next';
import { prepareRouteHandlersFromConfig } from '../../../next/prepare';
import { loadResolvedRouteHandlersConfigs } from '../../../next/runtime/config';
import {
  TEST_CATCH_ALL_ROUTE_PARAM_NAME,
  TEST_PRIMARY_CONTENT_PAGES_DIR,
  TEST_PRIMARY_ROUTE_SEGMENT,
  writeTestBaseStaticPropsPage,
  writeTestModule
} from '../../helpers/fixtures';
import { withTempDir } from '../../helpers/temp-dir';

import type { RouteHandlersConfig } from '../../../next/types';

describe('route handler preparation', () => {
  it('runs command preparation in the resolved cwd', async () => {
    await withTempDir('next-slug-splitter-prepare-', async rootDir => {
      const outputDirectory = path.join(rootDir, 'prepared-output');
      const routeHandlersConfig: RouteHandlersConfig = {
        app: {
          rootDir,
          nextConfigPath: path.join(rootDir, 'next.config.mjs'),
          prepare: [
            {
              id: 'write-sentinel',
              kind: 'command',
              command: [
                process.execPath,
                '-e',
                "require('node:fs').writeFileSync('sentinel.txt', 'ready');"
              ],
              cwd: 'prepared-output'
            }
          ]
        }
      };

      await mkdir(outputDirectory, { recursive: true });
      await prepareRouteHandlersFromConfig({
        rootDir,
        routeHandlersConfig
      });

      expect(
        await readFile(path.join(outputDirectory, 'sentinel.txt'), 'utf8')
      ).toBe('ready');
    });
  });

  it('runs tsc-project preparation with the app-local TypeScript before config resolution', async () => {
    await withTempDir('next-slug-splitter-prepare-', async rootDir => {
      const packageDirectory = path.join(
        rootDir,
        'node_modules',
        'prepared-route-handlers'
      );
      const processorOutputPath = path.join(
        packageDirectory,
        'dist',
        'processor.js'
      );

      await writeTestModule(path.join(rootDir, 'package.json'), '{}\n');
      await writeTestModule(
        path.join(packageDirectory, 'package.json'),
        `${JSON.stringify(
          {
            name: 'prepared-route-handlers',
            type: 'module',
            exports: {
              './components': './components.js',
              './processor': './dist/processor.js',
              './factory': './factory/index.js',
              './factory/none': './factory/none.js'
            }
          },
          null,
          2
        )}\n`
      );
      await writeTestModule(
        path.join(packageDirectory, 'components.js'),
        'export const CustomComponent = () => null;\n'
      );
      await writeTestModule(
        path.join(packageDirectory, 'factory', 'index.js'),
        'export const createHandlerPage = input => input;\n'
      );
      await writeTestModule(
        path.join(packageDirectory, 'factory', 'none.js'),
        'export const createHandlerPage = input => input;\n'
      );
      await writeTestModule(
        path.join(rootDir, 'packages', 'site-route-handlers', 'tsconfig.route-handlers.json'),
        '{}\n'
      );
      await writeTestModule(
        path.join(rootDir, 'node_modules', 'typescript', 'lib', 'tsc.js'),
        [
          "const { mkdirSync, writeFileSync } = require('node:fs');",
          "const path = require('node:path');",
          '',
          'const rootDir = process.cwd();',
          "const outputPath = path.join(rootDir, 'node_modules', 'prepared-route-handlers', 'dist', 'processor.js');",
          'mkdirSync(path.dirname(outputPath), { recursive: true });',
          'writeFileSync(',
          '  outputPath,',
          '  [',
          "    'export const routeHandlerProcessor = {',",
          "    '  ingress({ capturedKeys }) {',",
          "    '    const resolved = {};',",
          "    '    for (const key of capturedKeys) {',",
          "    '      resolved[key] = {};',",
          "    '    }',",
          "    '    return resolved;',",
          "    '  },',",
          "    '  egress({ capturedKeys }) {',",
          "    \"    return { factoryVariant: 'none', components: capturedKeys.map(key => ({ key })) };\",",
          "    '  }',",
          "    '};',",
          "    'export default routeHandlerProcessor;',",
          "    ''",
          "  ].join('\\n')",
          ');',
          ''
        ].join('\n')
      );
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
          nextConfigPath: path.join(rootDir, 'missing-next.config.mjs'),
          prepare: [
            {
              id: 'route-handler-runtime',
              kind: 'tsc-project',
              tsconfigPath: appRelativeModule(
                'packages/site-route-handlers/tsconfig.route-handlers.json'
              )
            }
          ]
        },
        ...createCatchAllRouteHandlersPreset({
          routeSegment: TEST_PRIMARY_ROUTE_SEGMENT,
          handlerRouteParam: {
            name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
            kind: 'catch-all'
          },
          contentPagesDir: TEST_PRIMARY_CONTENT_PAGES_DIR,
          handlerBinding: {
            componentsImport: packageModule('prepared-route-handlers/components'),
            processorImport: packageModule('prepared-route-handlers/processor'),
            runtimeFactory: {
              importBase: packageModule('prepared-route-handlers/factory')
            }
          }
        })
      };

      const [resolvedConfig] = await loadResolvedRouteHandlersConfigs({
        routeHandlersConfig,
        nextConfig: {
          i18n: {
            locales: ['en'],
            defaultLocale: 'en'
          }
        }
      });

      expect(resolvedConfig.processorConfig.processorImport).toEqual(
        packageModule('prepared-route-handlers/processor')
      );
      expect(await readFile(processorOutputPath, 'utf8')).toContain(
        'routeHandlerProcessor'
      );
    });
  });

  it('skips unchanged tsc-project preparation inputs and reruns when project inputs change', async () => {
    await withTempDir('next-slug-splitter-prepare-', async rootDir => {
      const invocationLogPath = path.join(rootDir, 'tsc-invocations.log');
      const tsconfigPath = path.join(
        rootDir,
        'packages',
        'site-route-handlers',
        'tsconfig.route-handlers.json'
      );
      const sourcePath = path.join(
        rootDir,
        'packages',
        'site-route-handlers',
        'src',
        'index.ts'
      );

      await writeTestModule(path.join(rootDir, 'package.json'), '{}\n');
      await writeTestModule(tsconfigPath, '{}\n');
      await writeTestModule(sourcePath, 'export const value = 1;\n');
      await writeTestModule(
        path.join(rootDir, 'node_modules', 'typescript', 'lib', 'tsc.js'),
        [
          "const { appendFileSync } = require('node:fs');",
          `appendFileSync(${JSON.stringify(invocationLogPath)}, 'run\\n');`,
          ''
        ].join('\n')
      );

      const routeHandlersConfig: RouteHandlersConfig = {
        app: {
          rootDir,
          nextConfigPath: path.join(rootDir, 'next.config.mjs'),
          prepare: [
            {
              id: 'route-handler-runtime',
              kind: 'tsc-project',
              tsconfigPath: appRelativeModule(
                'packages/site-route-handlers/tsconfig.route-handlers.json'
              )
            }
          ]
        }
      };

      await prepareRouteHandlersFromConfig({
        rootDir,
        routeHandlersConfig
      });
      await prepareRouteHandlersFromConfig({
        rootDir,
        routeHandlersConfig
      });

      const initialInvocations = (
        await readFile(invocationLogPath, 'utf8')
      )
        .split('\n')
        .filter(entry => entry.length > 0);
      expect(initialInvocations).toHaveLength(1);

      await writeFile(sourcePath, 'export const value = 2;\n', 'utf8');

      await prepareRouteHandlersFromConfig({
        rootDir,
        routeHandlersConfig
      });

      const updatedInvocations = (
        await readFile(invocationLogPath, 'utf8')
      )
        .split('\n')
        .filter(entry => entry.length > 0);
      expect(updatedInvocations).toHaveLength(2);
    });
  });
});
