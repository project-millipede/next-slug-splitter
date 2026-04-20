import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadRouteHandlerProxyRuntimeAttachmentsMock = vi.hoisted(() => vi.fn());
const readRouteHandlerProxyBootstrapMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../../next/proxy/runtime-attachments'), () => ({
  loadRouteHandlerProxyRuntimeAttachments:
    loadRouteHandlerProxyRuntimeAttachmentsMock
}));

vi.mock(
  import('../../../../next/proxy/bootstrap-persisted'),
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../../../../next/proxy/bootstrap-persisted')
      >();

    return {
      ...actual,
      readRouteHandlerProxyBootstrap: readRouteHandlerProxyBootstrapMock
    };
  }
);

import { bootstrapRouteHandlerProxyWorker } from '../../../../next/proxy/worker/runtime/bootstrap';
import { TEST_SINGLE_LOCALE_CONFIG } from '../../../helpers/fixtures';

import type { LocaleConfig } from '../../../../core/types';
import type {
  PersistedRouteHandlerProxyBootstrap,
  PersistedRouteHandlerProxyBootstrapAppTarget,
  PersistedRouteHandlerProxyBootstrapPagesTarget,
  PersistedRouteHandlerProxyBootstrapTarget
} from '../../../../next/proxy/bootstrap-persisted';

const createBootstrapManifest = ({
  bootstrapGenerationToken = 'bootstrap-token',
  localeConfig = TEST_SINGLE_LOCALE_CONFIG,
  targets = [createBootstrapTarget()]
}: {
  bootstrapGenerationToken?: string;
  localeConfig?: LocaleConfig;
  targets?: Array<PersistedRouteHandlerProxyBootstrapTarget>;
} = {}): PersistedRouteHandlerProxyBootstrap => ({
  version: 1,
  bootstrapGenerationToken,
  localeConfig,
  targets
});

function createBootstrapTarget(): PersistedRouteHandlerProxyBootstrapPagesTarget {
  return {
    routerKind: 'pages',
    targetId: 'docs',
    routeBasePath: '/docs',
    contentLocaleMode: 'filename',
    emitFormat: 'ts',
    handlerRouteParam: {
      name: 'slug',
      kind: 'catch-all'
    },
    handlerRouteSegment: 'generated-handlers',
    routeContract: {
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
  };
}

function createAppBootstrapTarget(): PersistedRouteHandlerProxyBootstrapAppTarget {
  return {
    routerKind: 'app',
    targetId: 'docs',
    routeBasePath: '/docs',
    contentLocaleMode: 'filename',
    emitFormat: 'ts',
    handlerRouteParam: {
      name: 'slug',
      kind: 'catch-all'
    },
    handlerRouteSegment: 'generated-handlers',
    routeContract: {
      kind: 'package',
      specifier: '@test/docs-route-module'
    },
    routeModule: {
      hasGeneratePageMetadata: true,
      revalidate: false
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
      generatedDir: '/repo/app/app/docs/generated-handlers'
    }
  };
}

const TEST_CONFIG_REGISTRATION = {
  rootDir: '/repo/app',
  configPath: '/repo/app/route-handlers-config.mjs'
};

describe('proxy worker bootstrap', () => {
  const ORIGINAL_ROOT_DIR_ENV = process.env.SLUG_SPLITTER_CONFIG_ROOT_DIR;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SLUG_SPLITTER_CONFIG_ROOT_DIR = '/repo/app';
    readRouteHandlerProxyBootstrapMock.mockResolvedValue(
      createBootstrapManifest()
    );
    loadRouteHandlerProxyRuntimeAttachmentsMock.mockResolvedValue({
      docs: {
        mdxCompileOptions: {
          remarkPlugins: [() => null]
        }
      }
    });
  });

  afterEach(() => {
    if (ORIGINAL_ROOT_DIR_ENV == null) {
      delete process.env.SLUG_SPLITTER_CONFIG_ROOT_DIR;
      return;
    }

    process.env.SLUG_SPLITTER_CONFIG_ROOT_DIR = ORIGINAL_ROOT_DIR_ENV;
  });

  it('combines structural manifest data with runtime attachments', async () => {
    const state = await bootstrapRouteHandlerProxyWorker(
      'bootstrap-token',
      TEST_SINGLE_LOCALE_CONFIG,
      TEST_CONFIG_REGISTRATION
    );
    const resolvedConfig = state.resolvedConfigsByTargetId.get('docs');

    expect(readRouteHandlerProxyBootstrapMock).toHaveBeenCalledWith(
      '/repo/app'
    );
    expect(loadRouteHandlerProxyRuntimeAttachmentsMock).toHaveBeenCalledWith(
      TEST_CONFIG_REGISTRATION
    );
    expect(state.bootstrapGenerationToken).toBe('bootstrap-token');
    expect(state.lazyResolvedTargets).toEqual([
      {
        routerKind: 'pages',
        targetId: 'docs',
        routeBasePath: '/docs',
        contentLocaleMode: 'filename',
        localeConfig: TEST_SINGLE_LOCALE_CONFIG,
        emitFormat: 'ts',
        handlerRouteParam: {
          name: 'slug',
          kind: 'catch-all'
        },
        paths: {
          rootDir: '/repo/app',
          contentDir: '/repo/app/content/pages',
          generatedDir: '/repo/app/pages/generated-handlers'
        }
      }
    ]);
    expect(state.resolvedConfigsByTargetId.size).toBe(1);
    expect(resolvedConfig).toMatchObject({
      routerKind: 'pages',
      targetId: 'docs',
      routeBasePath: '/docs',
      contentLocaleMode: 'filename',
      emitFormat: 'ts',
      handlerRouteParam: {
        name: 'slug',
        kind: 'catch-all'
      },
      routeContract: {
        kind: 'package',
        specifier: '@test/base-static-props'
      },
      processorConfig: {
        processorImport: {
          kind: 'package',
          specifier: '@test/processor'
        }
      },
      localeConfig: TEST_SINGLE_LOCALE_CONFIG,
      paths: {
        rootDir: '/repo/app',
        contentDir: '/repo/app/content/pages',
        generatedDir: '/repo/app/pages/generated-handlers'
      }
    });
    expect(resolvedConfig?.runtime.mdxCompileOptions.remarkPlugins).toEqual([
      expect.any(Function)
    ]);
  });

  it('throws when the structural manifest is missing', async () => {
    readRouteHandlerProxyBootstrapMock.mockResolvedValue(null);

    await expect(
      bootstrapRouteHandlerProxyWorker(
        'bootstrap-token',
        TEST_SINGLE_LOCALE_CONFIG,
        TEST_CONFIG_REGISTRATION
      )
    ).rejects.toThrow('Missing route-handler proxy bootstrap manifest.');
    expect(loadRouteHandlerProxyRuntimeAttachmentsMock).not.toHaveBeenCalled();
  });

  it('throws when the requested bootstrap token does not match the manifest token', async () => {
    await expect(
      bootstrapRouteHandlerProxyWorker(
        'other-bootstrap-token',
        TEST_SINGLE_LOCALE_CONFIG,
        TEST_CONFIG_REGISTRATION
      )
    ).rejects.toThrow(
      'Route-handler proxy worker bootstrap manifest does not match the requested bootstrap generation token.'
    );
  });

  it('throws when the requested localeConfig does not match the manifest localeConfig', async () => {
    await expect(
      bootstrapRouteHandlerProxyWorker(
        'bootstrap-token',
        {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        },
        TEST_CONFIG_REGISTRATION
      )
    ).rejects.toThrow(
      'Route-handler proxy worker bootstrap manifest localeConfig does not match the requested worker localeConfig.'
    );
  });

  it('throws when runtime attachments are missing a structural target', async () => {
    loadRouteHandlerProxyRuntimeAttachmentsMock.mockResolvedValue({});

    await expect(
      bootstrapRouteHandlerProxyWorker(
        'bootstrap-token',
        TEST_SINGLE_LOCALE_CONFIG,
        TEST_CONFIG_REGISTRATION
      )
    ).rejects.toThrow(
      'Route-handler proxy runtime attachments are missing target "docs".'
    );
  });

  it('throws when runtime attachments return an unexpected target', async () => {
    loadRouteHandlerProxyRuntimeAttachmentsMock.mockResolvedValue({
      docs: {
        mdxCompileOptions: {}
      },
      extra: {
        mdxCompileOptions: {}
      }
    });

    await expect(
      bootstrapRouteHandlerProxyWorker(
        'bootstrap-token',
        TEST_SINGLE_LOCALE_CONFIG,
        TEST_CONFIG_REGISTRATION
      )
    ).rejects.toThrow(
      'Route-handler proxy runtime attachments returned unexpected target "extra".'
    );
  });

  it('bootstraps App Router structural planner state from the shared manifest format', async () => {
    readRouteHandlerProxyBootstrapMock.mockResolvedValue(
      createBootstrapManifest({
        targets: [createAppBootstrapTarget()]
      })
    );

    const state = await bootstrapRouteHandlerProxyWorker(
      'bootstrap-token',
      TEST_SINGLE_LOCALE_CONFIG,
      TEST_CONFIG_REGISTRATION
    );
    const resolvedConfig = state.resolvedConfigsByTargetId.get('docs');

    expect(state.lazyResolvedTargets).toEqual([
      {
        routerKind: 'app',
        targetId: 'docs',
        routeBasePath: '/docs',
        contentLocaleMode: 'filename',
        localeConfig: TEST_SINGLE_LOCALE_CONFIG,
        emitFormat: 'ts',
        handlerRouteParam: {
          name: 'slug',
          kind: 'catch-all'
        },
        paths: {
          rootDir: '/repo/app',
          contentDir: '/repo/app/content/pages',
          generatedDir: '/repo/app/app/docs/generated-handlers'
        }
      }
    ]);
    expect(resolvedConfig).toMatchObject({
      routerKind: 'app',
      handlerRouteSegment: 'generated-handlers',
      routeContract: {
        kind: 'package',
        specifier: '@test/docs-route-module'
      },
      routeModule: {
        hasGeneratePageMetadata: true,
        revalidate: false
      }
    });
  });
});
