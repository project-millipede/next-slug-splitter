import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import {
  resolveRoutePayloadManifest,
  writeRoutePayloadManifest
} from './payload-manifest';
import type { BenchmarkRouteChunkCandidates, ManifestKind } from './types';

const TEST_ZONE_PATH = '/zones/page-router';
const temporaryBuildOutputDirs: string[] = [];

/**
 * Create an isolated `.next`-shaped directory for one manifest test.
 *
 * @returns Absolute temporary build output directory.
 */
const createTemporaryBuildOutputDir = async (): Promise<string> => {
  const buildOutputDir = await mkdtemp(
    path.join(os.tmpdir(), 'benchmark-route-payload-')
  );

  temporaryBuildOutputDirs.push(buildOutputDir);
  return buildOutputDir;
};

/**
 * Write one emitted JavaScript chunk fixture.
 *
 * @param buildOutputDir Absolute temporary `.next`-shaped directory.
 * @param relativePath Output path relative to that directory.
 * @param content Exact content used to determine emitted byte size.
 * @returns A promise that resolves after the fixture has been written.
 */
const writeChunkFixture = async (
  buildOutputDir: string,
  relativePath: string,
  content: Uint8Array
): Promise<void> => {
  const outputPath = path.join(buildOutputDir, relativePath);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content);
};

afterEach(async () => {
  for (const buildOutputDir of temporaryBuildOutputDirs.splice(0)) {
    await rm(buildOutputDir, { force: true, recursive: true });
  }
});

describe('route payload manifest generation', () => {
  test('selects the unique largest emitted artifact', async () => {
    const buildOutputDir = await createTemporaryBuildOutputDir();
    const smallChunk = `${TEST_ZONE_PATH}/_next/static/chunks/small.js`;
    const payloadChunk = `${TEST_ZONE_PATH}/_next/static/chunks/payload.js`;

    await writeChunkFixture(
      buildOutputDir,
      'static/chunks/small.js',
      new Uint8Array(32)
    );
    await writeChunkFixture(
      buildOutputDir,
      'static/chunks/payload.js',
      new Uint8Array(512)
    );

    const routeEntries: Record<string, BenchmarkRouteChunkCandidates> = {
      '/docs/interactive': {
        generatedHandlerPath: '/en/docs/generated-handlers/interactive/en',
        chunks: [smallChunk, payloadChunk]
      }
    };

    await expect(
      resolveRoutePayloadManifest(
        buildOutputDir,
        TEST_ZONE_PATH,
        routeEntries
      )
    ).resolves.toEqual({
      routes: {
        '/docs/interactive': {
          generatedHandlerPath: '/en/docs/generated-handlers/interactive/en',
          payloadChunk
        }
      }
    });
  });

  test('rejects a route without payload candidates', async () => {
    const buildOutputDir = await createTemporaryBuildOutputDir();
    const routeEntries: Record<string, BenchmarkRouteChunkCandidates> = {
      '/docs/getting-started': {
        generatedHandlerPath: null,
        chunks: []
      }
    };

    await expect(
      resolveRoutePayloadManifest(
        buildOutputDir,
        TEST_ZONE_PATH,
        routeEntries
      )
    ).rejects.toThrow(
      'Cannot select a unique largest emitted route chunk for "/docs/getting-started" because no candidate chunks were emitted.'
    );
  });

  test('rejects tied largest emitted route chunks', async () => {
    const buildOutputDir = await createTemporaryBuildOutputDir();
    const firstTiedChunk = `${TEST_ZONE_PATH}/_next/static/chunks/tied-a.js`;
    const secondTiedChunk = `${TEST_ZONE_PATH}/_next/static/chunks/tied-b.js`;

    await writeChunkFixture(
      buildOutputDir,
      'static/chunks/tied-a.js',
      new Uint8Array(128)
    );
    await writeChunkFixture(
      buildOutputDir,
      'static/chunks/tied-b.js',
      new Uint8Array(128)
    );

    const routeEntries: Record<string, BenchmarkRouteChunkCandidates> = {
      '/docs/dashboard': {
        generatedHandlerPath: '/en/docs/generated-handlers/dashboard/en',
        chunks: [firstTiedChunk, secondTiedChunk]
      }
    };

    await expect(
      resolveRoutePayloadManifest(
        buildOutputDir,
        TEST_ZONE_PATH,
        routeEntries
      )
    ).rejects.toThrow(
      `Cannot select a unique largest emitted route chunk for "/docs/dashboard" because these candidates have the same largest emitted size: ${firstTiedChunk}, ${secondTiedChunk}.`
    );
  });

  test('rejects candidates outside the configured facade', async () => {
    const buildOutputDir = await createTemporaryBuildOutputDir();
    const routeEntries: Record<string, BenchmarkRouteChunkCandidates> = {
      '/docs/interactive': {
        generatedHandlerPath: '/en/docs/generated-handlers/interactive/en',
        chunks: ['/zones/another-target/_next/static/chunks/payload.js']
      }
    };

    await expect(
      resolveRoutePayloadManifest(
        buildOutputDir,
        TEST_ZONE_PATH,
        routeEntries
      )
    ).rejects.toThrow(
      'does not start with facade prefix "/zones/page-router/_next/".'
    );
  });

  test.each([
    ['splitter', 'splitter-route-payload.json'],
    ['heavy-baseline', 'heavy-baseline-route-payload.json']
  ] as const)(
    'writes the %s target to its canonical filename',
    async (manifestKind: ManifestKind, manifestFilename: string) => {
      const buildOutputDir = await createTemporaryBuildOutputDir();
      const payloadChunk = `${TEST_ZONE_PATH}/_next/static/chunks/payload.js`;

      await writeChunkFixture(
        buildOutputDir,
        'static/chunks/payload.js',
        new Uint8Array(128)
      );

      const routeEntries: Record<string, BenchmarkRouteChunkCandidates> = {
        '/docs/getting-started': {
          generatedHandlerPath: null,
          chunks: [payloadChunk]
        }
      };

      const outputPath = await writeRoutePayloadManifest(
        buildOutputDir,
        manifestKind,
        routeEntries,
        TEST_ZONE_PATH
      );
      const serializedManifest = await readFile(outputPath, 'utf8');

      expect(outputPath).toBe(
        path.join(buildOutputDir, 'static', '__benchmark', manifestFilename)
      );
      expect(JSON.parse(serializedManifest)).toEqual({
        routes: {
          '/docs/getting-started': {
            generatedHandlerPath: null,
            payloadChunk
          }
        }
      });
      expect(serializedManifest.endsWith('\n')).toBe(true);
    }
  );
});
