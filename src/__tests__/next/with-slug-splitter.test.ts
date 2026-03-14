import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

import {
  withSlugSplitter
} from '../../next';
import {
  loadRegisteredSlugSplitterConfig,
  readRegisteredSlugSplitterConfigPath,
  resolveSlugSplitterAdapterEntry
} from '../../next/integration';
import { withTempDir } from '../helpers/temp-dir';

const ROUTE_HANDLERS_CONFIG_SYMBOL = Symbol.for(
  'next-slug-splitter/next/config'
);
const SLUG_SPLITTER_CONFIG_PATH_ENV = 'SLUG_SPLITTER_CONFIG_PATH';

const clearRegisteredRouteHandlersState = (): void => {
  const globalScope = globalThis as typeof globalThis & {
    [ROUTE_HANDLERS_CONFIG_SYMBOL]?: {
      config?: unknown;
    };
  };

  delete globalScope[ROUTE_HANDLERS_CONFIG_SYMBOL];
  delete process.env[SLUG_SPLITTER_CONFIG_PATH_ENV];
};

afterEach(() => {
  clearRegisteredRouteHandlersState();
});

describe('withSlugSplitter', () => {
  it('registers the config file path and installs the resolved adapter path', async () => {
    await withTempDir(
      'next-slug-splitter-with-slug-splitter-',
      async rootDir => {
        const configPath = path.join(rootDir, 'route-handlers.config.mjs');
        await writeFile(
          configPath,
          [
            'export const routeHandlersConfig = {',
            '  app: {',
            `    rootDir: ${JSON.stringify(rootDir)},`,
            `    nextConfigPath: ${JSON.stringify(path.join(rootDir, 'next.config.mjs'))}`,
            '  }',
            '};',
            ''
          ].join('\n'),
          'utf8'
        );

        const wrappedConfig = withSlugSplitter(
          {
            reactStrictMode: true
          },
          {
            configPath
          }
        );

        expect(wrappedConfig).toEqual({
          reactStrictMode: true,
          experimental: {
            adapterPath: resolveSlugSplitterAdapterEntry({
              rootDir: process.cwd()
            })
          }
        });
        expect(readRegisteredSlugSplitterConfigPath()).toBe(configPath);

        const loadedConfig = await loadRegisteredSlugSplitterConfig();
        expect(loadedConfig).toEqual({
          app: {
            rootDir,
            nextConfigPath: path.join(rootDir, 'next.config.mjs')
          }
        });
      }
    );
  });

  it('wraps Next config factories and preserves existing experimental options', async () => {
    await withTempDir(
      'next-slug-splitter-with-slug-splitter-',
      async rootDir => {
        const configPath = path.join(rootDir, 'route-handlers.config.mjs');
        await writeFile(
          configPath,
          'export default { app: { rootDir: "/tmp/app", nextConfigPath: "/tmp/app/next.config.mjs" } };\n',
          'utf8'
        );

        const wrappedConfig = withSlugSplitter(
          async () => ({
            experimental: {
              typedRoutes: true
            },
            images: {
              unoptimized: true
            }
          }),
          {
            configPath
          }
        );

        expect(typeof wrappedConfig).toBe('function');

        const resolvedConfig = await wrappedConfig('phase-production-build', {
          defaultConfig: {}
        });

        expect(resolvedConfig).toEqual({
          experimental: {
            typedRoutes: true,
            adapterPath: resolveSlugSplitterAdapterEntry({
              rootDir: process.cwd()
            })
          },
          images: {
            unoptimized: true
          }
        });
      }
    );
  });

  it('rejects existing experimental.adapterPath values', async () => {
    await withTempDir(
      'next-slug-splitter-with-slug-splitter-',
      async rootDir => {
        const configPath = path.join(rootDir, 'route-handlers.config.mjs');
        await writeFile(configPath, 'export default {};\n', 'utf8');

        expect(() =>
          withSlugSplitter(
            {
              experimental: {
                adapterPath: '/tmp/custom-adapter.mjs'
              }
            },
            {
              configPath
            }
          )
        ).toThrow(
          '[next-slug-splitter] withSlugSplitter(...) cannot be combined with an existing experimental.adapterPath.'
        );
      }
    );
  });
});
