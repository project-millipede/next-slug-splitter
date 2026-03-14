import { createHash } from 'node:crypto';
import { Dirent } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { toPosix } from '../core/discovery';
import { getHandlerFactoryVariantResolverIdentity } from '../core/runtime-variants';
import { isArray, isNumber, isString } from '../utils/type-guards';
import {
  isObjectRecord,
  readObjectProperty
} from '../utils/type-guards-custom';
import { isDefined } from '../utils/type-guards-extended';

import type { PipelineMode } from '../core/types';
import type {
  PipelineCacheRecord,
  ResolvedRouteHandlersConfigBase,
  RouteHandlerNextResult
} from './types';

/**
 * Configuration subset used for fingerprint computation.
 */
type RouteHandlerFingerprintConfig = ResolvedRouteHandlersConfigBase;

/**
 * Cache format version. Increment when the persistent cache contract changes.
 */
export const PIPELINE_CACHE_VERSION = 12;

const DEFAULT_PERSISTENT_CACHE_PATH = '.next/cache/route-handlers.json';

/**
 * Determine whether a file path should participate in route content
 * fingerprinting.
 *
 * @param filePath - Absolute file path.
 * @returns `true` when the file is a markdown content source.
 */
const isRouteContentFile = (filePath: string): boolean =>
  filePath.endsWith('.md') || filePath.endsWith('.mdx');

/**
 * Read directory entries in stable name order.
 *
 * @param directoryPath - Absolute directory path to read.
 * @returns Sorted directory entries.
 */
const readDirectorySorted = async (
  directoryPath: string
): Promise<Array<Dirent>> => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  return entries.sort((left, right) => left.name.localeCompare(right.name));
};

/**
 * Collect all route content files below one directory.
 *
 * @param directoryPath - Root directory to walk.
 * @returns Absolute content file paths sorted by the traversal order.
 */
const collectRouteContentFiles = async (
  directoryPath: string
): Promise<Array<string>> => {
  const files: Array<string> = [];

  const walk = async (currentPath: string): Promise<void> => {
    const entries = await readDirectorySorted(currentPath);

    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (entry.isFile() && isRouteContentFile(absolutePath)) {
        files.push(absolutePath);
      }
    }
  };

  try {
    await walk(directoryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  return files;
};

/**
 * Convert an absolute path into the relative path fragment used in cache
 * signatures.
 *
 * @param rootDir - Application root directory.
 * @param absolutePath - Absolute file path.
 * @returns POSIX-normalized relative path.
 */
const toRelativeSignature = (rootDir: string, absolutePath: string): string =>
  toPosix(path.relative(rootDir, absolutePath));

/**
 * Convert one file into its fingerprint signature.
 *
 * @param rootDir - Application root directory.
 * @param absolutePath - Absolute file path.
 * @returns Relative path, file size, and mtime signature, or `null` when the
 * file no longer exists.
 */
const toFileStatSignature = async (
  rootDir: string,
  absolutePath: string
): Promise<string | null> => {
  try {
    const fileStat = await stat(absolutePath);
    return `${toRelativeSignature(rootDir, absolutePath)}:${fileStat.size}:${Math.floor(
      fileStat.mtimeMs
    )}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
};

/**
 * Create a stable hash for cache identity payloads.
 *
 * @param payload - Structured payload to hash.
 * @returns Deterministic SHA-256 hash of the payload.
 */
const createStableHash = (payload: unknown): string =>
  createHash('sha256').update(JSON.stringify(payload)).digest('hex');

/**
 * Resolve the shared persistent cache location for next-slug-splitter.
 *
 * @remarks
 * All configured targets currently share one cache file. Target separation is
 * preserved inside that file through `targetId`-aware fingerprints and cached
 * heavy-route entries.
 *
 * @param rootDir - Application root directory.
 * @returns Absolute path to the cache file.
 */
export const resolvePersistentCachePath = ({
  rootDir
}: {
  rootDir: string;
}): string => path.resolve(rootDir, DEFAULT_PERSISTENT_CACHE_PATH);

/**
 * Compute the fingerprint for one resolved target.
 *
 * @remarks
 * `targetId` is part of the fingerprint. Two targets may share the same route
 * shape or source filenames, but they must not hash as the same cache
 * participant.
 *
 * @param input - Fingerprint computation input.
 * @returns Content fingerprint string for cache validation.
 */
export const computePipelineFingerprint = async ({
  config,
  mode
}: {
  config: RouteHandlerFingerprintConfig;
  mode: PipelineMode;
}): Promise<string> => {
  const rootDir = config.paths.rootDir;
  const contentFiles = await collectRouteContentFiles(
    config.paths.contentPagesDir
  );
  const contentFileStats = (
    await Promise.all(
      contentFiles.map(filePath => toFileStatSignature(rootDir, filePath))
    )
  ).filter(isDefined);
  const staticInputs = (
    await Promise.all([
      toFileStatSignature(config.app.rootDir, config.app.nextConfigPath),
      toFileStatSignature(rootDir, config.paths.buildtimeHandlerRegistryPath)
    ])
  ).filter(isDefined);

  return createStableHash({
    version: PIPELINE_CACHE_VERSION,
    targetId: config.targetId,
    mode,
    handlerRouteParam: config.handlerRouteParam,
    emitFormat: config.emitFormat,
    contentLocaleMode: config.contentLocaleMode,
    resolveHandlerFactoryVariant: getHandlerFactoryVariantResolverIdentity(
      config.resolveHandlerFactoryVariant
    ),
    runtimeHandlerFactoryImportBase: config.runtimeHandlerFactoryImportBase,
    baseStaticPropsImport: config.baseStaticPropsImport,
    routeBasePath: config.routeBasePath,
    contentFiles: contentFileStats,
    staticInputs
  });
};

/**
 * Compute the fingerprint for the full multi-target cache record.
 *
 * @remarks
 * The persistent cache stores one merged result for all configured targets.
 * This function preserves that single-record model while still keeping each
 * target's identity by hashing the already target-aware per-target fingerprints.
 *
 * @param input - Fingerprint computation input.
 * @returns Combined fingerprint string.
 */
export const computePipelineFingerprintForConfigs = async ({
  configs,
  mode
}: {
  configs: Array<RouteHandlerFingerprintConfig>;
  mode: PipelineMode;
}): Promise<string> => {
  const fingerprints = await Promise.all(
    configs.map(config => computePipelineFingerprint({ config, mode }))
  );

  return createStableHash({
    version: PIPELINE_CACHE_VERSION,
    mode,
    fingerprints
  });
};

/**
 * Determine whether a parsed value matches the persisted Next result shape.
 *
 * @param value - Candidate parsed cache result.
 * @returns `true` when the value matches the expected Next result contract.
 */
const isRouteHandlerNextResult = (
  value: unknown
): value is RouteHandlerNextResult => {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    isNumber(readObjectProperty(value, 'analyzedCount')) &&
    isNumber(readObjectProperty(value, 'heavyCount')) &&
    isArray(readObjectProperty(value, 'heavyPaths')) &&
    isArray(readObjectProperty(value, 'rewrites'))
  );
};

/**
 * Determine whether a parsed value matches the persistent cache-record shape.
 *
 * @param value - Candidate parsed cache record.
 * @returns `true` when the value matches the persistent cache-record contract.
 */
const isPipelineCacheRecord = (
  value: unknown
): value is PipelineCacheRecord => {
  if (!isObjectRecord(value)) {
    return false;
  }

  const emitFormat = readObjectProperty(value, 'emitFormat');
  return (
    isNumber(readObjectProperty(value, 'version')) &&
    isString(readObjectProperty(value, 'fingerprint')) &&
    isString(readObjectProperty(value, 'generatedAt')) &&
    (emitFormat === 'js' || emitFormat === 'ts') &&
    isRouteHandlerNextResult(readObjectProperty(value, 'result'))
  );
};

/**
 * Read the shared persistent cache record.
 *
 * @remarks
 * The cache is rebuildable, so invalid or missing data is treated as a cache
 * miss instead of a fatal parse error.
 *
 * @param cachePath - Absolute cache file path.
 * @returns Parsed cache record, or `null` if missing/invalid.
 */
export const readPersistentCacheRecord = async (
  cachePath: string
): Promise<PipelineCacheRecord | null> => {
  try {
    const raw = await readFile(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!isPipelineCacheRecord(parsed)) {
      return null;
    }

    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    return null;
  }
};

/**
 * Persist the shared next-slug-splitter cache record to disk.
 *
 * @param input - Cache write input.
 */
export const writePersistentCacheRecord = async ({
  cachePath,
  record
}: {
  /**
   * Absolute cache file path.
   */
  cachePath: string;
  /**
   * Cache record to persist.
   */
  record: PipelineCacheRecord;
}): Promise<void> => {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
};
