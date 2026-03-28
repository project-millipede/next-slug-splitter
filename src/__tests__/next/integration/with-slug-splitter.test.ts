import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import type { NextConfig } from 'next';
import { afterEach, describe, expect, it } from 'vitest';

import { withSlugSplitter } from '../../../next';
import {
  loadRegisteredSlugSplitterConfig,
  readRegisteredRouteHandlersConfig,
  readRegisteredSlugSplitterConfigPath,
  resolveRegisteredSlugSplitterConfigRegistration,
  resolveSlugSplitterAdapterEntry
} from '../../../next/integration';
import { resolveRouteHandlerRuntimeSemanticsPath } from '../../../next/runtime-semantics/persisted';
import { readRouteHandlerRuntimeSemantics } from '../../../next/runtime-semantics/read';
import { withTempDir } from '../../helpers/temp-dir';

/**
 * ARCHITECTURE OVERVIEW: withSlugSplitter Tests
 * These tests verify the Next.js configuration wrapper which is responsible for:
 * 1. REGISTRATION: Storing the configuration path or object in a global registry.
 * 2. RESOLUTION: Resolving the absolute path to the 'adapter.js' entry point.
 * 3. INJECTION: Merging that path into the Next.js 'adapterPath' option.
 * 4. FACTORY WRAPPING: Supporting both static config objects and async factory functions.
 * NOTE: Currently, 'resolveSlugSplitterAdapterEntry' is tested against 'process.cwd()'
 * because mocking internal 'require.resolve' calls in a Vitest environment
 * requires further investigation into module hoisting/caching.
 */

const ROUTE_HANDLERS_CONFIG_SYMBOL = Symbol.for(
  'next-slug-splitter/next/config'
);
const SLUG_SPLITTER_CONFIG_PATH_ENV = 'SLUG_SPLITTER_CONFIG_PATH';
const SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV = 'SLUG_SPLITTER_CONFIG_ROOT_DIR';
type StaticWrappedConfig = Exclude<
  ReturnType<typeof withSlugSplitter>,
  Function
>;

const TEST_DIRECT_ROUTE_HANDLERS_CONFIG = {
  app: {
    rootDir: process.cwd()
  }
} as const;

const TEST_DIRECT_NEXT_CONFIG: NextConfig = {
  reactStrictMode: true,
  i18n: {
    locales: ['en', 'de'],
    defaultLocale: 'de'
  }
};

const TEST_ASYNC_FACTORY_NEXT_CONFIG: NextConfig = {
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'fr'
  }
};

const clearRegisteredRouteHandlersState = (): void => {
  const globalScope = globalThis as typeof globalThis & {
    [ROUTE_HANDLERS_CONFIG_SYMBOL]?: {
      config?: unknown;
    };
  };

  delete globalScope[ROUTE_HANDLERS_CONFIG_SYMBOL];
  delete process.env[SLUG_SPLITTER_CONFIG_PATH_ENV];
  delete process.env[SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV];
};

afterEach(() => {
  clearRegisteredRouteHandlersState();
});

afterEach(async () => {
  await unlink(resolveRouteHandlerRuntimeSemanticsPath(process.cwd())).catch(
    () => undefined
  );
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
            `    rootDir: ${JSON.stringify(rootDir)}`,
            '  }',
            '};',
            ''
          ].join('\n'),
          'utf8'
        );

        const wrappedConfig = withSlugSplitter(
          {
            reactStrictMode: true,
            i18n: {
              locales: ['en', 'de'],
              defaultLocale: 'en'
            }
          },
          {
            configPath
          }
        );

        // Sequence Verification:
        // 1. Next.js Config Preservation: Verify user-provided options like 'reactStrictMode' remain.
        // 2. Adapter Injection: Ensure top-level 'adapterPath' is added to the config.
        expect(wrappedConfig as StaticWrappedConfig).toEqual({
          reactStrictMode: true,
          i18n: {
            locales: ['en', 'de'],
            defaultLocale: 'en'
          },
          adapterPath: resolveSlugSplitterAdapterEntry(process.cwd())
        });

        // 3. Registry State: Verify the file path is stored for the adapter's runtime process.
        expect(readRegisteredSlugSplitterConfigPath()).toBe(configPath);
        expect(process.env[SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV]).toBe(
          process.cwd()
        );

        // 4. Data Integrity: Verify that the loaded config matches the file content.
        const loadedConfig = await loadRegisteredSlugSplitterConfig();
        expect(loadedConfig).toEqual({
          app: {
            rootDir
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
          'export default { app: { rootDir: "/tmp/app" } };\n',
          'utf8'
        );

        const wrappedConfig = withSlugSplitter(
          async () => ({
            i18n: {
              locales: ['en', 'de'],
              defaultLocale: 'en'
            },
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
        if (typeof wrappedConfig !== 'function') {
          throw new Error('Expected wrapped Next config factory.');
        }

        const resolvedConfig = await wrappedConfig('phase-production-build', {
          defaultConfig: {}
        });

        // Sequence Verification for Factories:
        // 1. Factory Execution: The wrapper must execute and return the user's config.
        // 2. Experimental Preservation: Keep 'typedRoutes' intact while adding top-level 'adapterPath'.
        expect(resolvedConfig).toEqual({
          adapterPath: resolveSlugSplitterAdapterEntry(process.cwd()),
          i18n: {
            locales: ['en', 'de'],
            defaultLocale: 'en'
          },
          experimental: {
            typedRoutes: true
          },
          images: {
            unoptimized: true
          }
        });
      }
    );
  });

  it('registers an in-process routeHandlersConfig object when provided directly', async () => {
    const wrappedConfig = withSlugSplitter(TEST_DIRECT_NEXT_CONFIG, {
      routeHandlersConfig: TEST_DIRECT_ROUTE_HANDLERS_CONFIG
    });

    // Sequence Verification for Direct Objects:
    // 1. Registry: Store the object in-process (globalSymbol) rather than using a file path.
    expect(wrappedConfig as StaticWrappedConfig).toEqual({
      ...TEST_DIRECT_NEXT_CONFIG,
      adapterPath: resolveSlugSplitterAdapterEntry(process.cwd())
    });

    expect(readRegisteredRouteHandlersConfig()).toEqual(
      TEST_DIRECT_ROUTE_HANDLERS_CONFIG
    );
    expect(readRegisteredSlugSplitterConfigPath()).toBeUndefined();

    const loadedConfig = await loadRegisteredSlugSplitterConfig();
    expect(loadedConfig).toEqual(TEST_DIRECT_ROUTE_HANDLERS_CONFIG);
    expect(await readRouteHandlerRuntimeSemantics(process.cwd())).toEqual({
      localeConfig: {
        locales: ['en', 'de'],
        defaultLocale: 'de'
      }
    });
  });

  it('writes the runtime semantics snapshot for async Next config factories', async () => {
    const wrappedConfig = withSlugSplitter(
      async () => TEST_ASYNC_FACTORY_NEXT_CONFIG,
      {
        routeHandlersConfig: TEST_DIRECT_ROUTE_HANDLERS_CONFIG
      }
    );

    if (typeof wrappedConfig !== 'function') {
      throw new Error('Expected wrapped Next config factory.');
    }

    const resolvedConfig = await wrappedConfig('phase-production-build', {
      defaultConfig: {}
    });

    expect(resolvedConfig).toEqual({
      ...TEST_ASYNC_FACTORY_NEXT_CONFIG,
      adapterPath: resolveSlugSplitterAdapterEntry(process.cwd())
    });
    expect(await readRouteHandlerRuntimeSemantics(process.cwd())).toEqual({
      localeConfig: {
        locales: ['en', 'fr'],
        defaultLocale: 'fr'
      }
    });
  });

  it('falls back to the conventional root config file name when no explicit config-path registration exists', async () => {
    await withTempDir(
      'next-slug-splitter-with-slug-splitter-',
      async rootDir => {
        const conventionalConfigPath = path.join(
          rootDir,
          'route-handlers-config.ts'
        );

        await writeFile(conventionalConfigPath, 'export default {};\n', 'utf8');

        expect(
          resolveRegisteredSlugSplitterConfigRegistration(rootDir)
        ).toEqual({
          configPath: conventionalConfigPath,
          rootDir
        });
      }
    );
  });

  it('rejects existing adapterPath values', async () => {
    expect(() =>
      withSlugSplitter(
        {
          adapterPath: '/tmp/custom-adapter.mjs'
        },
        {
          routeHandlersConfig: TEST_DIRECT_ROUTE_HANDLERS_CONFIG
        }
      )
    ).toThrow(
      '[next-slug-splitter] withSlugSplitter(...) cannot be combined with an existing adapterPath.'
    );
  });

  it('rejects legacy experimental.adapterPath values with a migration error', async () => {
    const nextConfigWithLegacyAdapter = {
      experimental: {
        adapterPath: '/tmp/custom-adapter.mjs'
      }
    } as unknown as NextConfig;

    expect(() =>
      withSlugSplitter(nextConfigWithLegacyAdapter, {
        routeHandlersConfig: TEST_DIRECT_ROUTE_HANDLERS_CONFIG
      })
    ).toThrow(
      '[next-slug-splitter] withSlugSplitter(...) now installs the stable adapterPath option. Move any existing experimental.adapterPath to adapterPath before applying withSlugSplitter(...).'
    );
  });
});
