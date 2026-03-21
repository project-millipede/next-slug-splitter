import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPipelineResult } from '../../helpers/builders';

const computePipelineFingerprintMock = vi.hoisted(() => vi.fn());
const computePipelineFingerprintForConfigsMock = vi.hoisted(() => vi.fn());
const resolvePersistentCachePathMock = vi.hoisted(() => vi.fn());
const resolveSharedEmitFormatMock = vi.hoisted(() => vi.fn());
const readReusablePipelineCacheResultMock = vi.hoisted(() => vi.fn());
const writePipelineCacheResultMock = vi.hoisted(() => vi.fn());
const mergeRouteHandlerNextResultsMock = vi.hoisted(() => vi.fn());
const executeRouteHandlerTargetMock = vi.hoisted(() => vi.fn());

vi.mock('../../../next/cache', () => ({
  computePipelineFingerprint: computePipelineFingerprintMock,
  computePipelineFingerprintForConfigs: computePipelineFingerprintForConfigsMock,
  resolvePersistentCachePath: resolvePersistentCachePathMock
}));

vi.mock('../../../next/emit-format', () => ({
  resolveSharedEmitFormat: resolveSharedEmitFormatMock
}));

vi.mock('../../../next/runtime/cache', () => ({
  readReusablePipelineCacheResult: readReusablePipelineCacheResultMock,
  writePipelineCacheResult: writePipelineCacheResultMock
}));

vi.mock('../../../next/runtime/results', () => ({
  mergeRouteHandlerNextResults: mergeRouteHandlerNextResultsMock
}));

vi.mock('../../../next/runtime/target', () => ({
  executeRouteHandlerTarget: executeRouteHandlerTargetMock
}));

import { executeResolvedRouteHandlerNextPipeline } from '../../../next/runtime';

const createResolvedConfig = ({
  rootDir,
  targetId
}: {
  rootDir: string;
  targetId: string;
}) =>
  ({
    targetId,
    app: {
      rootDir,
      nextConfigPath: `${rootDir}/next.config.mjs`
    },
    paths: {
      rootDir,
      contentPagesDir: `${rootDir}/content`,
      handlersDir: `${rootDir}/pages/content/_handlers`
    }
  }) as any;

describe('runtime index shared cache policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    resolvePersistentCachePathMock.mockReturnValue(
      '/tmp/app/.next/cache/route-handlers.json'
    );
    resolveSharedEmitFormatMock.mockReturnValue('ts');
    computePipelineFingerprintMock.mockResolvedValue('single-fingerprint');
    computePipelineFingerprintForConfigsMock.mockResolvedValue(
      'multi-fingerprint'
    );
    writePipelineCacheResultMock.mockResolvedValue(undefined);
  });

  it('still executes the single-target generate path instead of returning early from shared cache', async () => {
    const cachedResult = createPipelineResult({
      analyzedCount: 99,
      heavyCount: 99
    });
    const freshResult = createPipelineResult({
      analyzedCount: 2,
      heavyCount: 2
    });

    readReusablePipelineCacheResultMock.mockResolvedValue(cachedResult);
    executeRouteHandlerTargetMock.mockResolvedValue(freshResult);

    const result = await executeResolvedRouteHandlerNextPipeline({
      resolvedConfigs: [
        createResolvedConfig({
          rootDir: '/tmp/app',
          targetId: 'docs'
        })
      ],
      mode: 'generate'
    });

    expect(result).toEqual(freshResult);
    expect(readReusablePipelineCacheResultMock).not.toHaveBeenCalled();
    expect(executeRouteHandlerTargetMock).toHaveBeenCalledTimes(1);
    expect(writePipelineCacheResultMock).toHaveBeenCalledWith({
      cachePath: '/tmp/app/.next/cache/route-handlers.json',
      fingerprint: 'single-fingerprint',
      emitFormat: 'ts',
      result: freshResult
    });
  });

  it('still executes every multi-target generate path instead of returning early from shared cache', async () => {
    const cachedResult = createPipelineResult({
      analyzedCount: 99,
      heavyCount: 99
    });
    const freshDocsResult = createPipelineResult({
      analyzedCount: 3,
      heavyCount: 1
    });
    const freshBlogResult = createPipelineResult({
      analyzedCount: 4,
      heavyCount: 2
    });
    const mergedFreshResult = createPipelineResult({
      analyzedCount: 7,
      heavyCount: 3
    });

    readReusablePipelineCacheResultMock.mockResolvedValue(cachedResult);
    executeRouteHandlerTargetMock
      .mockResolvedValueOnce(freshDocsResult)
      .mockResolvedValueOnce(freshBlogResult);
    mergeRouteHandlerNextResultsMock.mockReturnValue(mergedFreshResult);

    const result = await executeResolvedRouteHandlerNextPipeline({
      resolvedConfigs: [
        createResolvedConfig({
          rootDir: '/tmp/app',
          targetId: 'docs'
        }),
        createResolvedConfig({
          rootDir: '/tmp/app',
          targetId: 'blog'
        })
      ],
      mode: 'generate'
    });

    expect(result).toEqual(mergedFreshResult);
    expect(readReusablePipelineCacheResultMock).not.toHaveBeenCalled();
    expect(executeRouteHandlerTargetMock).toHaveBeenCalledTimes(2);
    expect(mergeRouteHandlerNextResultsMock).toHaveBeenCalledWith({
      results: [freshDocsResult, freshBlogResult]
    });
    expect(writePipelineCacheResultMock).toHaveBeenCalledWith({
      cachePath: '/tmp/app/.next/cache/route-handlers.json',
      fingerprint: 'multi-fingerprint',
      emitFormat: 'ts',
      result: mergedFreshResult
    });
  });
});
