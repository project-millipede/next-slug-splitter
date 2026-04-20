import { beforeEach, describe, expect, it, vi } from 'vitest';

const readRouteHandlerProxyBootstrapMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../../next/proxy/bootstrap-persisted'), () => ({
  readRouteHandlerProxyBootstrap: readRouteHandlerProxyBootstrapMock
}));

import {
  clearRouteHandlerProxyBootstrapStateCache,
  getRouteHandlerProxyBootstrapState
} from '../../../../next/proxy/runtime/bootstrap-state';

import type { LocaleConfig } from '../../../../core/types';
import type {
  PersistedRouteHandlerProxyBootstrap,
  PersistedRouteHandlerProxyBootstrapPagesTarget,
  PersistedRouteHandlerProxyBootstrapTarget
} from '../../../../next/proxy/bootstrap-persisted';

const TEST_LOCALE_CONFIG: LocaleConfig = {
  locales: ['en', 'de'],
  defaultLocale: 'en'
};

const createBootstrapManifest = ({
  localeConfig = TEST_LOCALE_CONFIG,
  targets = []
}: {
  localeConfig?: LocaleConfig;
  targets?: Array<PersistedRouteHandlerProxyBootstrapTarget>;
} = {}): PersistedRouteHandlerProxyBootstrap => ({
  version: 1,
  bootstrapGenerationToken: 'bootstrap-token',
  localeConfig,
  targets
});

const createBootstrapTarget =
  (): PersistedRouteHandlerProxyBootstrapPagesTarget => ({
    targetId: 'docs',
    routerKind: 'pages',
    routeBasePath: '/docs',
    contentLocaleMode: 'filename',
    emitFormat: 'ts',
    handlerRouteParam: {
      name: 'slug',
      kind: 'catch-all'
    },
    handlerRouteSegment: 'generated-handlers',
    baseStaticPropsImport: {
      kind: 'package',
      specifier: '@test/base-static-props'
    },
    processorConfig: {
      processorImport: {
        kind: 'package',
        specifier: '@test/processor'
      }
    },
    paths: {
      rootDir: '/repo/app',
      contentDir: '/repo/app/content/pages',
      generatedDir: '/repo/app/pages/generated-handlers'
    }
  });

describe('proxy bootstrap state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRouteHandlerProxyBootstrapStateCache();
  });

  it('derives lightweight parent-side state from the persisted bootstrap manifest', async () => {
    readRouteHandlerProxyBootstrapMock.mockResolvedValue(
      createBootstrapManifest({
        targets: [createBootstrapTarget()]
      })
    );

    await expect(
      getRouteHandlerProxyBootstrapState(TEST_LOCALE_CONFIG, {
        rootDir: '/repo/app'
      })
    ).resolves.toEqual({
      hasConfiguredTargets: true,
      targetRouteBasePaths: ['/docs'],
      bootstrapGenerationToken: 'bootstrap-token'
    });
    expect(readRouteHandlerProxyBootstrapMock).toHaveBeenCalledWith(
      '/repo/app'
    );
  });

  it('throws when the persisted bootstrap manifest is missing', async () => {
    readRouteHandlerProxyBootstrapMock.mockResolvedValue(null);

    await expect(
      getRouteHandlerProxyBootstrapState(
        {
          locales: ['en'],
          defaultLocale: 'en'
        },
        {
          rootDir: '/repo/app'
        }
      )
    ).rejects.toThrow('Missing route-handler proxy bootstrap manifest.');
  });

  it('throws when the manifest localeConfig does not match the generated proxy localeConfig', async () => {
    readRouteHandlerProxyBootstrapMock.mockResolvedValue(
      createBootstrapManifest({
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        }
      })
    );

    await expect(
      getRouteHandlerProxyBootstrapState(
        {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        },
        {
          rootDir: '/repo/app'
        }
      )
    ).rejects.toThrow(
      'Route-handler proxy bootstrap manifest localeConfig does not match the generated proxy localeConfig.'
    );
  });

  it('reuses cached bootstrap state for the same locale and rootDir pair', async () => {
    readRouteHandlerProxyBootstrapMock.mockResolvedValue(
      createBootstrapManifest({
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        }
      })
    );

    await getRouteHandlerProxyBootstrapState(
      {
        locales: ['en'],
        defaultLocale: 'en'
      },
      {
        rootDir: '/repo/app'
      }
    );
    await getRouteHandlerProxyBootstrapState(
      {
        locales: ['en'],
        defaultLocale: 'en'
      },
      {
        rootDir: '/repo/app'
      }
    );

    expect(readRouteHandlerProxyBootstrapMock).toHaveBeenCalledTimes(1);
  });
});
