import { beforeEach, describe, expect, test, vi } from 'vitest';

import { resolvePagesChunks } from './chunks';

import type { AdapterBuildContext } from '../types';

const manifestMocks = vi.hoisted(() => ({
  parsePagesBuildManifest: vi.fn(),
  parseStaticBuildManifest: vi.fn(),
  resolvePagesClientBuildManifestPath: vi.fn()
}));

vi.mock(import('./manifests'), () => manifestMocks);

const TEST_CONTEXT: AdapterBuildContext = {
  projectDir: '/repo/demo/page-router',
  distDir: '/repo/demo/page-router/.next',
  buildId: 'test-build-id',
  routing: {
    beforeFiles: []
  },
  outputs: {
    appPages: [],
    pages: [{}],
    staticFiles: [
      {
        filePath:
          '/repo/demo/page-router/.next/static/test-build-id/_buildManifest.js'
      }
    ]
  }
};

describe('Pages Router chunk resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    manifestMocks.resolvePagesClientBuildManifestPath.mockReturnValue(
      '/repo/demo/page-router/.next/static/test-build-id/_buildManifest.js'
    );
  });

  test('uses a locale-less manifest key for a stable locale-prefixed destination', async () => {
    manifestMocks.parseStaticBuildManifest.mockResolvedValue({
      '/': ['static/chunks/root-browser.js'],
      '/docs/[...slug]': ['static/chunks/catch-all-browser.js'],
      '/docs/generated-handlers/dashboard/de': [
        'static/chunks/root-browser.js',
        'static/chunks/catch-all-browser.js',
        'static/chunks/route-browser.js'
      ]
    });
    manifestMocks.parsePagesBuildManifest.mockResolvedValue({
      '/_app': ['static/chunks/app.js'],
      '/docs/[...slug]': ['static/chunks/catch-all-root.js'],
      '/docs/generated-handlers/dashboard/de': [
        'static/chunks/app.js',
        'static/chunks/catch-all-root.js',
        'static/chunks/route-root.js'
      ]
    });

    await expect(
      resolvePagesChunks(
        TEST_CONTEXT,
        '/zones/page-router',
        '/de/docs/generated-handlers/dashboard/de'
      )
    ).resolves.toEqual([
      '/zones/page-router/_next/static/chunks/route-browser.js',
      '/zones/page-router/_next/static/chunks/route-root.js'
    ]);
  });

  test('keeps only JavaScript chunks from mixed Pages route assets', async () => {
    manifestMocks.parseStaticBuildManifest.mockResolvedValue({
      '/docs/generated-handlers/dashboard/de': [
        'static/chunks/route-browser.js',
        'static/chunks/route-browser.css'
      ]
    });
    manifestMocks.parsePagesBuildManifest.mockResolvedValue({
      '/docs/generated-handlers/dashboard/de': [
        'static/chunks/route-root.js',
        'static/chunks/route.css',
        'static/chunks/route.js.map',
        'static/chunks/route-query.js?cache=1'
      ]
    });

    await expect(
      resolvePagesChunks(
        TEST_CONTEXT,
        '/zones/page-router',
        '/docs/generated-handlers/dashboard/de'
      )
    ).resolves.toEqual([
      '/zones/page-router/_next/static/chunks/route-browser.js',
      '/zones/page-router/_next/static/chunks/route-root.js'
    ]);
  });

  test('prefers an exact manifest route over a stripped candidate', async () => {
    manifestMocks.parseStaticBuildManifest.mockResolvedValue({
      '/docs/generated-handlers/dashboard/de': ['static/chunks/stripped.js'],
      '/de/docs/generated-handlers/dashboard/de': ['static/chunks/exact.js']
    });
    manifestMocks.parsePagesBuildManifest.mockResolvedValue({});

    await expect(
      resolvePagesChunks(
        TEST_CONTEXT,
        '/zones/page-router',
        '/de/docs/generated-handlers/dashboard/de'
      )
    ).resolves.toEqual(['/zones/page-router/_next/static/chunks/exact.js']);
  });

  test('removes at most one leading segment', async () => {
    manifestMocks.parseStaticBuildManifest.mockResolvedValue({
      '/docs/generated-handlers/dashboard/de': ['static/chunks/route.js']
    });
    manifestMocks.parsePagesBuildManifest.mockResolvedValue({});

    await expect(
      resolvePagesChunks(
        TEST_CONTEXT,
        '/zones/page-router',
        '/preview/de/docs/generated-handlers/dashboard/de'
      )
    ).resolves.toEqual([]);
  });
});
