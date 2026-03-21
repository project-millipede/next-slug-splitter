import {
  PIPELINE_CACHE_VERSION,
  readPersistentCacheRecord,
  writePersistentCacheRecord
} from '../../cache';

import type { EmitFormat } from '../../../core/types';
import type { PipelineCacheRecord, RouteHandlerNextResult } from '../../types';

/**
 * Read a reusable pipeline cache record using the shared cache-record contract.
 *
 * @remarks
 * This file belongs to the "shared persistent runtime cache" group.
 *
 * Its job is intentionally narrow:
 * - validate the serialized `.next/cache/route-handlers.json` record
 * - read and write that record
 * - stay completely unaware of whether the caller is allowed to skip deeper
 *   work such as per-target planning or handler emission
 *
 * That separation matters because multiple consumers touch this cache group
 * for different reasons:
 * - runtime orchestration may persist the merged result after executing targets
 * - lookup code may read the record to answer heavy-route membership questions
 * - policy code decides whether a cache hit may return early at all
 *
 * In other words, this module defines the storage contract for the shared
 * record, while other modules define the execution semantics around it.
 *
 * @param input - Cache read input.
 * @returns The reusable cached result when identity matches, otherwise
 * `undefined`.
 */
export const readReusablePipelineCacheResult = async ({
  cachePath,
  fingerprint,
  emitFormat
}: {
  /**
   * Persistent cache file path.
   */
  cachePath: string;
  /**
   * Expected cache fingerprint.
   */
  fingerprint: string;
  /**
   * Expected emitted file format.
   */
  emitFormat: EmitFormat;
}): Promise<RouteHandlerNextResult | undefined> => {
  const cachedRecord = await readPersistentCacheRecord(cachePath);

  if (
    !cachedRecord ||
    cachedRecord.version !== PIPELINE_CACHE_VERSION ||
    cachedRecord.fingerprint !== fingerprint ||
    cachedRecord.emitFormat !== emitFormat
  ) {
    return undefined;
  }

  return cachedRecord.result;
};

/**
 * Persist one pipeline result into the cache.
 *
 * @remarks
 * This write path is the final step of the shared runtime-cache group. By the
 * time callers reach this helper, all target-level planning and generation
 * decisions are already finished and the merged Next-facing result is ready to
 * become the new persisted lookup artifact.
 *
 * @param input - Cache write input.
 */
export const writePipelineCacheResult = async ({
  cachePath,
  fingerprint,
  emitFormat,
  result
}: {
  /**
   * Persistent cache file path.
   */
  cachePath: string;
  /**
   * Fingerprint representing the configured splitter inputs.
   */
  fingerprint: string;
  /**
   * Emit format shared by the cached result.
   */
  emitFormat: EmitFormat;
  /**
   * Next integration result to persist.
   */
  result: RouteHandlerNextResult;
}): Promise<void> => {
  const record: PipelineCacheRecord = {
    version: PIPELINE_CACHE_VERSION,
    fingerprint,
    emitFormat,
    generatedAt: new Date().toISOString(),
    result
  };

  await writePersistentCacheRecord({
    cachePath,
    record
  });
};
