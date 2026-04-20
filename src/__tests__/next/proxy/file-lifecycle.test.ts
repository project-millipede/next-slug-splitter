import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

import { createCatchAllRouteHandlersPreset } from '../../../next/config';
import { synchronizeRouteHandlerProxyFile } from '../../../next/proxy/file-lifecycle';
import { resolveRouteHandlerRoutingStrategy } from '../../../next/shared/policy/routing-strategy';
import {
  TEST_CATCH_ALL_ROUTE_PARAM_NAME,
  createTestHandlerBinding
} from '../../helpers/fixtures';
import { withTempDir } from '../../helpers/temp-dir';

import type { LocaleConfig } from '../../../core/types';
import type {
  ResolvedRouteHandlersConfig,
  RouteHandlersConfig
} from '../../../next/pages/types';

const SYNTHETIC_PROXY_MARKER =
  'next-slug-splitter:experimental-synthetic-proxy';

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
      handlerBinding: createTestHandlerBinding()
    }),
    createCatchAllRouteHandlersPreset({
      routeSegment: 'blog',
      handlerRouteParam: {
        name: TEST_CATCH_ALL_ROUTE_PARAM_NAME,
        kind: 'catch-all'
      },
      contentDir: path.join(rootDir, 'blog', 'src', 'pages'),
      handlerBinding: createTestHandlerBinding()
    })
  ]
});

const createResolvedConfigs = ({
  rootDir,
  routeHandlersConfig,
  localeConfig = {
    locales: ['en', 'de'],
    defaultLocale: 'en'
  }
}: {
  rootDir: string;
  routeHandlersConfig: RouteHandlersConfig;
  localeConfig?: LocaleConfig;
}): Array<ResolvedRouteHandlersConfig> => {
  const targets = Array.isArray(routeHandlersConfig.targets)
    ? routeHandlersConfig.targets
    : [routeHandlersConfig];

  return targets.map((targetConfig, targetIndex) => ({
    routeBasePath: targetConfig.routeBasePath,
    localeConfig
  })) as Array<ResolvedRouteHandlersConfig>;
};

const createDevelopmentRoutingPolicy = ({
  routeHandlersConfig
}: {
  routeHandlersConfig: RouteHandlersConfig;
}) => ({
  development: routeHandlersConfig.app?.routing?.development ?? 'proxy',
  workerPrewarm: routeHandlersConfig.app?.routing?.workerPrewarm ?? 'off'
});

describe('generated proxy file lifecycle', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('writes a plugin-owned proxy.ts with target matchers in development by default', async () => {
    await withTempDir('next-slug-splitter-synthetic-proxy-', async rootDir => {
      const routeHandlersConfig = createMultiTargetConfig(rootDir);
      const proxyPath = path.join(rootDir, 'proxy.ts');
      const resolvedConfigs = createResolvedConfigs({
        rootDir,
        routeHandlersConfig
      });

      vi.stubEnv('NODE_ENV', 'development');

      await synchronizeRouteHandlerProxyFile({
        rootDir,
        strategy: resolveRouteHandlerRoutingStrategy(
          PHASE_DEVELOPMENT_SERVER,
          createDevelopmentRoutingPolicy({
            routeHandlersConfig
          })
        ),
        resolvedConfigs
      });

      const proxySource = await readFile(proxyPath, 'utf8');

      expect(proxySource).toContain(SYNTHETIC_PROXY_MARKER);
      expect(proxySource).toContain(
        "import { proxy as routeHandlerProxy } from 'next-slug-splitter/next/proxy';"
      );
      expect(proxySource).not.toContain("'/_next/data/:path*'");
      expect(proxySource).toContain("'/docs/:path*'");
      expect(proxySource).toContain("'/blog/:path*'");
      expect(proxySource).toContain("'/de/docs/:path*'");
      expect(proxySource).toContain("'/de/blog/:path*'");
      expect(proxySource).toContain('const CONFIG_REGISTRATION = {');
      expect(proxySource).toContain('configPath: undefined');
      expect(proxySource).toContain('rootDir: undefined');
    });
  });

  it('does not emit locale-prefixed proxy matchers for single-locale targets', async () => {
    await withTempDir('next-slug-splitter-synthetic-proxy-', async rootDir => {
      const routeHandlersConfig = createMultiTargetConfig(rootDir);
      const proxyPath = path.join(rootDir, 'proxy.ts');
      const resolvedConfigs = createResolvedConfigs({
        rootDir,
        routeHandlersConfig,
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        }
      });

      vi.stubEnv('NODE_ENV', 'development');

      await synchronizeRouteHandlerProxyFile({
        rootDir,
        strategy: resolveRouteHandlerRoutingStrategy(
          PHASE_DEVELOPMENT_SERVER,
          createDevelopmentRoutingPolicy({
            routeHandlersConfig
          })
        ),
        resolvedConfigs
      });

      const proxySource = await readFile(proxyPath, 'utf8');

      expect(proxySource).toContain("'/docs/:path*'");
      expect(proxySource).toContain("'/blog/:path*'");
      expect(proxySource).not.toContain("'/en/docs/:path*'");
      expect(proxySource).not.toContain("'/en/blog/:path*'");
    });
  });

  it('embeds app-owned config registration into the generated proxy bridge when available', async () => {
    await withTempDir('next-slug-splitter-synthetic-proxy-', async rootDir => {
      const routeHandlersConfig = createMultiTargetConfig(rootDir);
      const proxyPath = path.join(rootDir, 'proxy.ts');
      const resolvedConfigs = createResolvedConfigs({
        rootDir,
        routeHandlersConfig
      });
      const configPath = path.join(rootDir, 'route-handlers-config.ts');

      vi.stubEnv('NODE_ENV', 'development');

      await synchronizeRouteHandlerProxyFile({
        rootDir,
        strategy: resolveRouteHandlerRoutingStrategy(
          PHASE_DEVELOPMENT_SERVER,
          createDevelopmentRoutingPolicy({
            routeHandlersConfig
          })
        ),
        resolvedConfigs,
        configRegistration: {
          configPath,
          rootDir
        }
      });

      const proxySource = await readFile(proxyPath, 'utf8');

      expect(proxySource).toContain(`configPath: '${configPath}'`);
      expect(proxySource).toContain(`rootDir: '${rootDir}'`);
      expect(proxySource).toContain('configRegistration: {');
    });
  });

  it('removes a previously generated proxy.ts when development routing is explicitly forced back to rewrites', async () => {
    await withTempDir('next-slug-splitter-synthetic-proxy-', async rootDir => {
      const routeHandlersConfig = createMultiTargetConfig(rootDir);
      const proxyPath = path.join(rootDir, 'proxy.ts');
      const resolvedConfigs = createResolvedConfigs({
        rootDir,
        routeHandlersConfig
      });

      vi.stubEnv('NODE_ENV', 'development');

      await synchronizeRouteHandlerProxyFile({
        rootDir,
        strategy: resolveRouteHandlerRoutingStrategy(
          PHASE_DEVELOPMENT_SERVER,
          createDevelopmentRoutingPolicy({
            routeHandlersConfig
          })
        ),
        resolvedConfigs
      });

      routeHandlersConfig.app = {
        ...routeHandlersConfig.app,
        routing: {
          development: 'rewrites'
        }
      };

      await synchronizeRouteHandlerProxyFile({
        rootDir,
        strategy: resolveRouteHandlerRoutingStrategy(
          PHASE_DEVELOPMENT_SERVER,
          createDevelopmentRoutingPolicy({
            routeHandlersConfig
          })
        ),
        resolvedConfigs
      });

      await expect(access(proxyPath)).rejects.toBeTruthy();
    });
  });

  it('does not delete a user-authored proxy.ts when development routing is forced to rewrites', async () => {
    await withTempDir('next-slug-splitter-synthetic-proxy-', async rootDir => {
      const routeHandlersConfig = createMultiTargetConfig(rootDir);
      const proxyPath = path.join(rootDir, 'proxy.ts');
      const resolvedConfigs = createResolvedConfigs({
        rootDir,
        routeHandlersConfig
      });

      await writeFile(
        proxyPath,
        'export function proxy() { return Response.redirect("https://example.com"); }\n',
        'utf8'
      );

      vi.stubEnv('NODE_ENV', 'development');
      routeHandlersConfig.app = {
        ...routeHandlersConfig.app,
        routing: {
          development: 'rewrites'
        }
      };

      await synchronizeRouteHandlerProxyFile({
        rootDir,
        strategy: resolveRouteHandlerRoutingStrategy(
          PHASE_DEVELOPMENT_SERVER,
          createDevelopmentRoutingPolicy({
            routeHandlersConfig
          })
        ),
        resolvedConfigs
      });

      expect(await readFile(proxyPath, 'utf8')).toContain(
        'https://example.com'
      );
    });
  });

  it('fails fast when development defaults to proxy and an app-owned proxy.ts already exists', async () => {
    await withTempDir('next-slug-splitter-synthetic-proxy-', async rootDir => {
      const routeHandlersConfig = createMultiTargetConfig(rootDir);
      const resolvedConfigs = createResolvedConfigs({
        rootDir,
        routeHandlersConfig
      });

      await writeFile(
        path.join(rootDir, 'proxy.ts'),
        'export function proxy() { return Response.json({ ok: true }); }\n',
        'utf8'
      );

      vi.stubEnv('NODE_ENV', 'development');

      await expect(
        synchronizeRouteHandlerProxyFile({
          rootDir,
          strategy: resolveRouteHandlerRoutingStrategy(
            PHASE_DEVELOPMENT_SERVER,
            createDevelopmentRoutingPolicy({
              routeHandlersConfig
            })
          ),
          resolvedConfigs
        })
      ).rejects.toThrow(/existing app-owned proxy file/i);
    });
  });

  it('fails fast when development defaults to proxy and a legacy middleware.ts exists', async () => {
    await withTempDir('next-slug-splitter-synthetic-proxy-', async rootDir => {
      const routeHandlersConfig = createMultiTargetConfig(rootDir);
      const resolvedConfigs = createResolvedConfigs({
        rootDir,
        routeHandlersConfig
      });

      await writeFile(
        path.join(rootDir, 'middleware.ts'),
        'export function middleware() { return Response.json({ ok: true }); }\n',
        'utf8'
      );

      vi.stubEnv('NODE_ENV', 'development');

      await expect(
        synchronizeRouteHandlerProxyFile({
          rootDir,
          strategy: resolveRouteHandlerRoutingStrategy(
            PHASE_DEVELOPMENT_SERVER,
            createDevelopmentRoutingPolicy({
              routeHandlersConfig
            })
          ),
          resolvedConfigs
        })
      ).rejects.toThrow(/existing app-owned middleware file/i);
    });
  });
});
