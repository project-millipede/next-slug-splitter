import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  readPersistentCacheRecord,
  writePersistentCacheRecord
} from '../../next/cache';
import { createPipelineResult } from '../helpers/builders';
import { withTempDir } from '../helpers/temp-dir';

import type { PipelineCacheRecord } from '../../next/types';

describe('persistent cache', () => {
  it('keeps pipeline record shape across read and write', async () => {
    await withTempDir('next-slug-splitter-cache-', async rootDir => {
      const cachePath = path.join(
        rootDir,
        '.next',
        'cache',
        'route-handlers.json'
      );

      const record: PipelineCacheRecord = {
        version: 1,
        fingerprint: 'abc123',
        emitFormat: 'js',
        generatedAt: '2026-03-09T12:00:00.000Z',
        result: createPipelineResult()
      };

      await writePersistentCacheRecord({
        cachePath,
        record
      });

      const loaded = await readPersistentCacheRecord(cachePath);
      expect(loaded).toBeTruthy();
      expect(loaded?.fingerprint).toBe(record.fingerprint);
      expect(loaded?.emitFormat).toBe('js');
      expect(loaded?.result.heavyCount).toBe(1);
    });
  });
});
