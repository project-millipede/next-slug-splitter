import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

import { relativeModule } from '../../../module-reference';
import { createCatchAllRouteHandlersPreset } from '../../../next/config';
import { synchronizeRouteHandlerInstrumentationFile } from '../../../next/proxy/instrumentation/file-lifecycle';
import { resolveRouteHandlerRoutingStrategy } from '../../../next/shared/policy/routing-strategy';
import {
  TEST_CATCH_ALL_ROUTE_PARAM_NAME,
  TEST_MULTI_LOCALE_CONFIG,
  createTestHandlerBinding
} from '../../helpers/fixtures';
import { withTempDir } from '../../helpers/temp-dir';

import type { RouteHandlersConfig } from '../../../next/pages/types';

const SYNTHETIC_INSTRUMENTATION_MARKER =
  'next-slug-splitter:experimental-proxy-instrumentation';
const createMultiTargetConfig = (rootDir: string): RouteHandlersConfig => ({
  routerKind: 'pages',
  app: {
    rootDir
  },
  targets: [
    createCatchAllRouteHandlersPreset({
      routeSegment: 'docs',
      handlerRouteParam: {
        name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
        kind: 'catch-all'
      },
      contentDir: path.join(rootDir, 'docs', 'src', 'pages'),
      routeContract: relativeModule('pages/docs/[...entry]'),
      handlerBinding: createTestHandlerBinding()
    }),
    createCatchAllRouteHandlersPreset({
      routeSegment: 'blog',
      handlerRouteParam: {
        name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
        kind: 'catch-all'
      },
      contentDir: path.join(rootDir, 'blog', 'src', 'pages'),
      routeContract: relativeModule('pages/blog/[...entry]'),
      handlerBinding: createTestHandlerBinding()
    })
  ]
});

const createDevelopmentRoutingPolicy = ({
  routeHandlersConfig
}: {
  routeHandlersConfig: RouteHandlersConfig;
}) => ({
  development: routeHandlersConfig.app?.routing?.development ?? 'proxy',
  workerPrewarm: routeHandlersConfig.app?.routing?.workerPrewarm ?? 'off'
});

describe('generated instrumentation file lifecycle', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('writes a plugin-owned instrumentation.ts when dev proxy worker prewarm is enabled', async () => {
    await withTempDir('next-slug-splitter-instrumentation-', async rootDir => {
      const routeHandlersConfig = createMultiTargetConfig(rootDir);
      const instrumentationPath = path.join(rootDir, 'instrumentation.ts');

      routeHandlersConfig.app = {
        ...routeHandlersConfig.app,
        routing: {
          development: 'proxy',
          workerPrewarm: 'instrumentation'
        }
      };

      vi.stubEnv('NODE_ENV', 'development');

      await synchronizeRouteHandlerInstrumentationFile({
        rootDir,
        strategy: resolveRouteHandlerRoutingStrategy(
          PHASE_DEVELOPMENT_SERVER,
          createDevelopmentRoutingPolicy({
            routeHandlersConfig
          })
        ),
        routingPolicy: createDevelopmentRoutingPolicy({
          routeHandlersConfig
        }),
        localeConfig: TEST_MULTI_LOCALE_CONFIG
      });

      const instrumentationSource = await readFile(instrumentationPath, 'utf8');

      expect(instrumentationSource).toContain(SYNTHETIC_INSTRUMENTATION_MARKER);
      expect(instrumentationSource).toContain(
        "import { prewarmRouteHandlerProxyWorker } from 'next-slug-splitter/next/instrumentation';"
      );
      expect(instrumentationSource).toContain(
        'export async function register()'
      );
      expect(instrumentationSource).toContain(
        'await prewarmRouteHandlerProxyWorker({'
      );
    });
  });

  it('removes a previously generated instrumentation.ts when worker prewarm is turned off', async () => {
    await withTempDir('next-slug-splitter-instrumentation-', async rootDir => {
      const routeHandlersConfig = createMultiTargetConfig(rootDir);
      const instrumentationPath = path.join(rootDir, 'instrumentation.ts');

      routeHandlersConfig.app = {
        ...routeHandlersConfig.app,
        routing: {
          development: 'proxy',
          workerPrewarm: 'instrumentation'
        }
      };

      vi.stubEnv('NODE_ENV', 'development');

      await synchronizeRouteHandlerInstrumentationFile({
        rootDir,
        strategy: resolveRouteHandlerRoutingStrategy(
          PHASE_DEVELOPMENT_SERVER,
          createDevelopmentRoutingPolicy({
            routeHandlersConfig
          })
        ),
        routingPolicy: createDevelopmentRoutingPolicy({
          routeHandlersConfig
        }),
        localeConfig: TEST_MULTI_LOCALE_CONFIG
      });

      routeHandlersConfig.app = {
        ...routeHandlersConfig.app,
        routing: {
          development: 'proxy',
          workerPrewarm: 'off'
        }
      };

      await synchronizeRouteHandlerInstrumentationFile({
        rootDir,
        strategy: resolveRouteHandlerRoutingStrategy(
          PHASE_DEVELOPMENT_SERVER,
          createDevelopmentRoutingPolicy({
            routeHandlersConfig
          })
        ),
        routingPolicy: createDevelopmentRoutingPolicy({
          routeHandlersConfig
        }),
        localeConfig: TEST_MULTI_LOCALE_CONFIG
      });

      await expect(access(instrumentationPath)).rejects.toBeTruthy();
    });
  });

  it('fails fast when worker prewarm is enabled and an app-owned instrumentation.ts already exists', async () => {
    await withTempDir('next-slug-splitter-instrumentation-', async rootDir => {
      const routeHandlersConfig = createMultiTargetConfig(rootDir);

      routeHandlersConfig.app = {
        ...routeHandlersConfig.app,
        routing: {
          development: 'proxy',
          workerPrewarm: 'instrumentation'
        }
      };

      await writeFile(
        path.join(rootDir, 'instrumentation.ts'),
        'export async function register() { console.log("app-owned"); }\n',
        'utf8'
      );

      vi.stubEnv('NODE_ENV', 'development');

      await expect(
        synchronizeRouteHandlerInstrumentationFile({
          rootDir,
          strategy: resolveRouteHandlerRoutingStrategy(
            PHASE_DEVELOPMENT_SERVER,
            createDevelopmentRoutingPolicy({
              routeHandlersConfig
            })
          ),
          routingPolicy: createDevelopmentRoutingPolicy({
            routeHandlersConfig
          }),
          localeConfig: TEST_MULTI_LOCALE_CONFIG
        })
      ).rejects.toThrow(/existing app-owned instrumentation file/i);
    });
  });

  it('does not delete a user-authored instrumentation.ts when worker prewarm is disabled', async () => {
    await withTempDir('next-slug-splitter-instrumentation-', async rootDir => {
      const routeHandlersConfig = createMultiTargetConfig(rootDir);
      const instrumentationPath = path.join(rootDir, 'instrumentation.ts');

      await writeFile(
        instrumentationPath,
        'export async function register() { console.log("app-owned"); }\n',
        'utf8'
      );

      vi.stubEnv('NODE_ENV', 'development');

      await synchronizeRouteHandlerInstrumentationFile({
        rootDir,
        strategy: resolveRouteHandlerRoutingStrategy(
          PHASE_DEVELOPMENT_SERVER,
          createDevelopmentRoutingPolicy({
            routeHandlersConfig
          })
        ),
        routingPolicy: createDevelopmentRoutingPolicy({
          routeHandlersConfig
        }),
        localeConfig: TEST_MULTI_LOCALE_CONFIG
      });

      expect(await readFile(instrumentationPath, 'utf8')).toContain(
        'app-owned'
      );
    });
  });
});
