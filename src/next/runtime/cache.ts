import {
  PIPELINE_CACHE_VERSION,
  readPersistentCacheRecord,
  writePersistentCacheRecord
} from '../cache';

import type { EmitFormat } from '../../core/types';
import type { PipelineCacheRecord, RouteHandlerNextResult } from '../types';

/**
 * Read a reusable pipeline cache record using the identity-only cache policy.
 *
 * @remarks
 * Generation/runtime cache reuse is cache-only. Matching cache identity is the
 * sole freshness contract; generated handler files are not read from disk
 * here.
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
