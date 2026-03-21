/**
 * Selective synchronization of generated handler files.
 *
 * @remarks
 * This module belongs to the "selective handler emission" cache group. Its
 * purpose is different from the route-planning caches:
 * - planning caches answer "which routes are heavy and what should be emitted?"
 * - this module answers "which generated files already match that answer on
 *   disk, and which ones must be written or removed?"
 *
 * The manifest stored by this subsystem is intentionally scoped to one
 * handlers directory. That lets the generator compare desired output hashes
 * against the previous emission state without re-reading or rewriting every
 * generated file on each run.
 *
 * Consumers reach this module indirectly from `emitRouteHandlerPages(...)`
 * after planning has already completed. By the time a call arrives here, the
 * only remaining concern is synchronizing filesystem output efficiently and
 * safely.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hashSync, HashAlgorithm } from '@cacheable/utils';
import {
  clearRouteHandlerOutputDirectory,
  doesRouteHandlerOutputFileExist,
  ensureRouteHandlerOutputDirectory,
  removeRenderedRouteHandlerPageIfPresent,
  synchronizeRenderedRouteHandlerPage
} from '../protocol/output-lifecycle';
import type { RenderedHandlerPage } from '../protocol/rendered-page';

import { isArray, isString } from '../../utils/type-guards';
import {
  isObjectRecord,
  readObjectProperty
} from '../../utils/type-guards-custom';

import type { RouteHandlerPaths } from '../../core/types';

const HANDLER_EMISSION_MANIFEST_DIRECTORY = path.join(
  '.next',
  'cache',
  'route-handlers-emission'
);
const HANDLER_EMISSION_MANIFEST_VERSION = 1;

type HandlerEmissionManifestEntry = {
  relativePath: string;
  outputHash: string;
};

type HandlerEmissionManifest = {
  version: number;
  handlersDir: string;
  entries: Array<HandlerEmissionManifestEntry>;
};

const resolveHandlerEmissionManifestPath = ({
  paths
}: {
  paths: RouteHandlerPaths;
}): string => {
  const handlersDirKey = hashSync(
    path.relative(paths.rootDir, paths.handlersDir),
    {
      algorithm: HashAlgorithm.DJB2
    }
  );

  return path.join(
    paths.rootDir,
    HANDLER_EMISSION_MANIFEST_DIRECTORY,
    `${handlersDirKey}.json`
  );
};

const isHandlerEmissionManifest = (
  value: unknown
): value is HandlerEmissionManifest => {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    readObjectProperty(value, 'version') === HANDLER_EMISSION_MANIFEST_VERSION &&
    isString(readObjectProperty(value, 'handlersDir')) &&
    isArray(readObjectProperty(value, 'entries')) &&
    (readObjectProperty(value, 'entries') as Array<unknown>).every(entry => {
      if (!isObjectRecord(entry)) {
        return false;
      }

      return (
        isString(readObjectProperty(entry, 'relativePath')) &&
        isString(readObjectProperty(entry, 'outputHash'))
      );
    })
  );
};

const readHandlerEmissionManifest = async (
  manifestPath: string
): Promise<HandlerEmissionManifest | null> => {
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    return isHandlerEmissionManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeHandlerEmissionManifest = async ({
  manifestPath,
  manifest
}: {
  manifestPath: string;
  manifest: HandlerEmissionManifest;
}): Promise<void> => {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
};

/**
 * Synchronize generated handler files against the desired rendered outputs.
 *
 * When a previous manifest exists, unchanged files are skipped, changed files
 * are rewritten, and stale generated files are removed. When no manifest is
 * available, the handlers directory falls back to the historical full rebuild.
 *
 * @param input - Selective emission input.
 */
export const syncEmittedHandlerPages = async ({
  paths,
  pages
}: {
  paths: RouteHandlerPaths;
  pages: Array<RenderedHandlerPage>;
}): Promise<void> => {
  // Consumer entry into the selective emission group. The generator has
  // already rendered the desired handler sources and is now asking this layer
  // to reconcile those desired outputs with what is currently on disk.
  const manifestPath = resolveHandlerEmissionManifestPath({ paths });
  const existingManifest = await readHandlerEmissionManifest(manifestPath);
  const hasReusableManifest =
    existingManifest != null && existingManifest.handlersDir === paths.handlersDir;

  if (!hasReusableManifest) {
    // No reusable manifest means this emission group has no trustworthy prior
    // knowledge. In that case we intentionally fall back to the historical
    // full rebuild behavior before establishing a new manifest baseline.
    await clearRouteHandlerOutputDirectory(paths.handlersDir);
  } else {
    await ensureRouteHandlerOutputDirectory(paths.handlersDir);
  }

  const desiredPagesByRelativePath = new Map(
    pages.map(page => [page.relativePath, page] as const)
  );
  const existingHashesByRelativePath = new Map(
    (existingManifest?.entries ?? []).map(entry => [
      entry.relativePath,
      entry.outputHash
    ])
  );

  if (hasReusableManifest) {
    for (const entry of existingManifest.entries) {
      if (desiredPagesByRelativePath.has(entry.relativePath)) {
        continue;
      }

      // This is the stale-file cleanup branch of the selective emission group.
      // The previous manifest knew about a file that the current desired set no
      // longer contains, so the emitted file must be removed.
      const staleFilePath = path.join(paths.handlersDir, entry.relativePath);
      await removeRenderedRouteHandlerPageIfPresent({
        pageFilePath: staleFilePath,
        handlersDir: paths.handlersDir
      });
    }
  }

  for (const page of pages) {
    const previousHash = existingHashesByRelativePath.get(page.relativePath);
    if (
      hasReusableManifest &&
      previousHash === page.outputHash &&
      (await doesRouteHandlerOutputFileExist(page.pageFilePath))
    ) {
      // Cache hit inside the emission group: the desired output hash still
      // matches the previously emitted file, and the file is present, so no
      // rewrite is necessary.
      continue;
    }

    await synchronizeRenderedRouteHandlerPage({
      page
    });
  }

  await writeHandlerEmissionManifest({
    manifestPath,
    manifest: {
      version: HANDLER_EMISSION_MANIFEST_VERSION,
      handlersDir: paths.handlersDir,
      entries: pages.map(page => ({
        relativePath: page.relativePath,
        outputHash: page.outputHash
      }))
    }
  });
};
