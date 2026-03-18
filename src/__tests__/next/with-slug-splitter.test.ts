import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

import { withSlugSplitter } from '../../next';
import {
  loadRegisteredSlugSplitterConfig,
  readRegisteredRouteHandlersConfig,
  readRegisteredSlugSplitterConfigPath,
  resolveSlugSplitterAdapterEntry
} from '../../next/integration';
import { withTempDir } from '../helpers/temp-dir';

/**
 * ARCHITECTURE OVERVIEW: withSlugSplitter Tests
 * * These tests verify the Next.js configuration wrapper which is responsible for:
 * 1. REGISTRATION: Storing the configuration path or object in a global registry.
 * 2. RESOLUTION: Resolving the absolute path to the 'adapter.js' entry point.
 * 3. INJECTION: Merging that path into the Next.js 'experimental.adapterPath' option.
 * 4. FACTORY WRAPPING: Supporting both static config objects and async factory functions.
 * * NOTE: Currently, 'resolveSlugSplitterAdapterEntry' is tested against 'process.cwd()'
 * because mocking internal 'require.resolve' calls in a Vitest environment
 * requires further investigation into module hoisting/caching.
 */

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

        // Sequence Verification:
        // 1. Next.js Config Preservation: Verify user-provided options like 'reactStrictMode' remain.
        // 2. Adapter Injection: Ensure 'experimental.adapterPath' is added to the config.
        expect(wrappedConfig as any).toEqual({
          reactStrictMode: true,
          experimental: {
            adapterPath: resolveSlugSplitterAdapterEntry(process.cwd())
          }
        });

        // 3. Registry State: Verify the file path is stored for the adapter's runtime process.
        expect(readRegisteredSlugSplitterConfigPath()).toBe(configPath);

        // 4. Data Integrity: Verify that the loaded config matches the file content.
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

        const resolvedConfig = await (wrappedConfig as any)(
          'phase-production-build',
          {
            defaultConfig: {}
          }
        );

        // Sequence Verification for Factories:
        // 1. Factory Execution: The wrapper must execute and return the user's config.
        // 2. Experimental Merging: Merge 'adapterPath' without overwriting existing 'typedRoutes'.
        expect(resolvedConfig).toEqual({
          experimental: {
            typedRoutes: true,
            adapterPath: resolveSlugSplitterAdapterEntry(process.cwd())
          },
          images: {
            unoptimized: true
          }
        });
      }
    );
  });

  it('registers an in-process routeHandlersConfig object when provided directly', async () => {
    const routeHandlersConfig = {
      app: {
        rootDir: process.cwd(),
        nextConfigPath: path.join(process.cwd(), 'next.config.ts')
      }
    };

    const wrappedConfig = withSlugSplitter(
      {
        reactStrictMode: true
      },
      {
        routeHandlersConfig
      }
    );

    // Sequence Verification for Direct Objects:
    // 1. Registry: Store the object in-process (globalSymbol) rather than using a file path.
    expect(wrappedConfig as any).toEqual({
      reactStrictMode: true,
      experimental: {
        adapterPath: resolveSlugSplitterAdapterEntry(process.cwd())
      }
    });

    expect(readRegisteredRouteHandlersConfig()).toEqual(routeHandlersConfig);
    expect(readRegisteredSlugSplitterConfigPath()).toBeUndefined();

    const loadedConfig = await loadRegisteredSlugSplitterConfig();
    expect(loadedConfig).toEqual(routeHandlersConfig);
  });

  it('rejects existing experimental.adapterPath values', async () => {
    await withTempDir(
      'next-slug-splitter-with-slug-splitter-',
      async rootDir => {
        const configPath = path.join(rootDir, 'route-handlers.config.mjs');
        await writeFile(configPath, 'export default {};\n', 'utf8');

        // Guard Verification:
        // Verify the plugin doesn't accidentally stomp on other Next.js experimental adapters.
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
