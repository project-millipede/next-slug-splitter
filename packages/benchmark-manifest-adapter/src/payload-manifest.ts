import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { MANIFEST_FILENAMES } from './common';
import type { BenchmarkRouteChunkCandidates, ManifestKind } from './types';

/**
 * Identify the Next.js asset boundary inside a benchmark facade URL.
 *
 * For example:
 *
 * a. Facade prefix: `/zones/page-router`
 * b. Next.js asset path: `/_next/static/chunks/payload.js`
 */
const NEXT_ASSET_PATH_PREFIX = '/_next/';

/**
 * Identify the exact JavaScript payload the browser must measure for one route.
 *
 * This model is the successful hand-off from build analysis to browser
 * measurement:
 *
 * 1. Build analysis:
 *    a. The router resolver produces route-specific chunk candidates.
 *    b. The adapter selects the uniquely largest emitted artifact.
 *
 * 2. Manifest publication:
 *    a. `payloadChunk` stores its exact browser-visible facade path.
 *    b. `generatedHandlerPath` retains the generated-handler relationship for
 *       benchmark diagnostics.
 *
 * 3. Browser measurement:
 *    a. The iframe loads the public route as a new document.
 *    b. The measurement accepts the selected payload only when the route
 *       requests it as an initial external JavaScript resource.
 *    c. When iframe load completes, the website reads its buffered Resource
 *       Timing entries once.
 *    d. The entry whose pathname equals `payloadChunk` supplies the response
 *       status, encoded JavaScript bytes, decoded JavaScript bytes, and load
 *       duration.
 *
 * 4. Contract enforcement:
 *    a. A present route without candidates fails the target build.
 *    b. Equally largest candidates fail the target build.
 *    c. A published payload absent from the completed initial document load
 *       fails browser measurement.
 *    d. Light splitter routes are intentionally absent from the manifest.
 *
 * The published model therefore contains one usable resource identity—not
 * selection failure states. This avoids a separate JavaScript fetch, a fixed
 * settlement delay, a post-load resource observer, and runtime payload
 * identification based on a size threshold.
 */
export type RoutePayloadManifestEntry = {
  /**
   * Generated-handler route retained for diagnostics, or null for a baseline.
   */
  generatedHandlerPath: string | null;
  /** Exact selected facade pathname required during initial document loading. */
  payloadChunk: string;
};

/**
 * Publish exact JavaScript payload measurement instructions by public route.
 *
 * Each present entry identifies one selected resource that browser measurement
 * must find in the completed initial document load. An absent light splitter
 * route intentionally represents no route-specific payload.
 */
export type RoutePayloadManifest = {
  /** Exact payload measurement instructions keyed by public benchmark route. */
  routes: Record<string, RoutePayloadManifestEntry>;
};

/**
 * Convert one facade chunk URL back to its emitted Next.js output path.
 *
 * The conversion flow is:
 *
 * 1. Require the chunk to belong to the configured target facade.
 * 2. Remove `<zonePath>/_next/` from the browser-visible URL.
 * 3. Resolve the remaining path below the target's `.next` directory.
 * 4. Reject a path that would escape that build directory.
 *
 * @param buildOutputDir Absolute `.next` build output directory.
 * @param zonePath Browser-visible facade prefix for the target.
 * @param chunkPath Facade JavaScript path from the resolved candidate set.
 * @returns Absolute emitted JavaScript file path.
 * @throws When the chunk does not belong to the facade or escapes the build
 * output directory.
 */
const resolveChunkBuildOutputPath = (
  buildOutputDir: string,
  zonePath: string,
  chunkPath: string
): string => {
  const facadeChunkPrefix = `${zonePath}${NEXT_ASSET_PATH_PREFIX}`;

  if (!chunkPath.startsWith(facadeChunkPrefix)) {
    throw new Error(
      `Route chunk candidate "${chunkPath}" does not start with facade prefix "${facadeChunkPrefix}".`
    );
  }

  const chunkOutputRelativePath = chunkPath.slice(facadeChunkPrefix.length);
  const resolvedBuildOutputDir = path.resolve(buildOutputDir);
  const chunkOutputPath = path.resolve(
    resolvedBuildOutputDir,
    chunkOutputRelativePath
  );
  const buildOutputPathPrefix = `${resolvedBuildOutputDir}${path.sep}`;

  if (!chunkOutputPath.startsWith(buildOutputPathPrefix)) {
    throw new Error(
      `Route chunk candidate "${chunkPath}" escapes build output "${resolvedBuildOutputDir}".`
    );
  }

  return chunkOutputPath;
};

/**
 * Read the emitted byte size of one JavaScript chunk candidate.
 *
 * This size is used only to select the unique largest emitted chunk for the
 * route. Browser Resource Timing remains responsible for measuring its encoded
 * and decoded transfer sizes.
 *
 * @param chunkOutputPath Absolute emitted JavaScript file path.
 * @returns Emitted file size in bytes.
 * @throws When the output cannot be read or is not a regular file.
 */
const readChunkBuildOutputByteSize = async (
  chunkOutputPath: string
): Promise<number> => {
  const chunkOutputStats = await stat(chunkOutputPath);

  if (!chunkOutputStats.isFile()) {
    throw new Error(
      `Route chunk candidate "${chunkOutputPath}" is not a file.`
    );
  }

  return chunkOutputStats.size;
};

/**
 * Select the unique largest emitted JavaScript artifact for one route.
 *
 * The selection flow is:
 *
 * 1. Remove duplicate paths while retaining manifest order.
 * 2. Resolve and inspect each emitted JavaScript file sequentially.
 * 3. Select the candidate with the greatest emitted byte size.
 * 4. Fail the build when no candidate was emitted.
 * 5. Fail the build when multiple candidates share the largest emitted size.
 *
 * @param buildOutputDir Absolute `.next` build output directory.
 * @param zonePath Browser-visible facade prefix for the target.
 * @param routePath Public route whose payload is being selected.
 * @param chunkPaths Facade JavaScript chunk candidates from one route entry.
 * @returns Facade path of the uniquely largest emitted artifact.
 * @throws When there are no candidates, the largest candidate is ambiguous,
 * or a candidate cannot be mapped to a regular emitted file.
 */
const selectLargestEmittedRouteChunk = async (
  buildOutputDir: string,
  zonePath: string,
  routePath: string,
  chunkPaths: ReadonlyArray<string>
): Promise<string> => {
  let largestChunkPath: string | null = null;
  let largestChunkByteSize = -1;
  const tiedLargestChunkPaths: string[] = [];

  for (const chunkPath of new Set(chunkPaths)) {
    const chunkOutputPath = resolveChunkBuildOutputPath(
      buildOutputDir,
      zonePath,
      chunkPath
    );
    const chunkByteSize = await readChunkBuildOutputByteSize(chunkOutputPath);

    if (chunkByteSize > largestChunkByteSize) {
      largestChunkPath = chunkPath;
      largestChunkByteSize = chunkByteSize;
      tiedLargestChunkPaths.length = 0;
      continue;
    }

    if (chunkByteSize === largestChunkByteSize && largestChunkPath != null) {
      if (tiedLargestChunkPaths.length === 0) {
        tiedLargestChunkPaths.push(largestChunkPath);
      }

      tiedLargestChunkPaths.push(chunkPath);
    }
  }

  if (largestChunkPath == null) {
    throw new Error(
      `Cannot select a unique largest emitted route chunk for "${routePath}" because no candidate chunks were emitted.`
    );
  }

  if (tiedLargestChunkPaths.length > 0) {
    throw new Error(
      `Cannot select a unique largest emitted route chunk for "${routePath}" because these candidates have the same largest emitted size: ${tiedLargestChunkPaths.join(', ')}.`
    );
  }

  return largestChunkPath;
};

/**
 * Resolve the canonical payload manifest from internal route candidates.
 *
 * The router resolvers remain the only source of route-specific JavaScript
 * candidates. This function adds no App Router or Pages Router behavior; it
 * selects the uniquely largest artifact from each already-resolved candidate
 * collection.
 *
 * @param buildOutputDir Absolute `.next` build output directory.
 * @param zonePath Browser-visible facade prefix for the target.
 * @param routeCandidates Internal candidate collections keyed by public route.
 * @returns Canonical exact-payload manifest for the resolved routes.
 * @throws When a route has no uniquely largest candidate or a candidate cannot
 * be mapped to a regular emitted file.
 */
export const resolveRoutePayloadManifest = async (
  buildOutputDir: string,
  zonePath: string,
  routeCandidates: Readonly<Record<string, BenchmarkRouteChunkCandidates>>
): Promise<RoutePayloadManifest> => {
  const routes: Record<string, RoutePayloadManifestEntry> = {};

  for (const [routePath, routeCandidate] of Object.entries(routeCandidates)) {
    const payloadChunk = await selectLargestEmittedRouteChunk(
      buildOutputDir,
      zonePath,
      routePath,
      routeCandidate.chunks
    );

    routes[routePath] = {
      generatedHandlerPath: routeCandidate.generatedHandlerPath,
      payloadChunk
    };
  }

  return {
    routes
  };
};

/**
 * Generate and publish one canonical exact-payload manifest.
 *
 * The publication flow is:
 *
 * 1. Resolve exact payload selections from the internal route candidates.
 * 2. Choose the canonical filename associated with the target kind.
 * 3. Create the benchmark manifest directory when necessary.
 * 4. Serialize readable JSON with a final newline.
 * 5. Publish the single manifest consumed by the website and release verifier.
 *
 * @param buildOutputDir Absolute `.next` build output directory.
 * @param manifestKind Splitter or heavy-baseline target kind.
 * @param routeCandidates Internal candidate collections keyed by public route.
 * @param zonePath Browser-visible facade prefix for the target.
 * @returns Absolute output path of the canonical payload manifest.
 * @throws When candidate inspection or manifest publication fails.
 */
export const writeRoutePayloadManifest = async (
  buildOutputDir: string,
  manifestKind: ManifestKind,
  routeCandidates: Readonly<Record<string, BenchmarkRouteChunkCandidates>>,
  zonePath: string
): Promise<string> => {
  const manifest = await resolveRoutePayloadManifest(
    buildOutputDir,
    zonePath,
    routeCandidates
  );
  const outputPath = path.join(
    buildOutputDir,
    'static',
    '__benchmark',
    MANIFEST_FILENAMES[manifestKind]
  );
  const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializedManifest);

  return outputPath;
};
