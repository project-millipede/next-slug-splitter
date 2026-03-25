import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPipelineResult } from '../../helpers/builders';

const mergeRouteHandlerNextResultsMock = vi.hoisted(() => vi.fn());
const synchronizeRouteHandlerPhaseArtifactsMock = vi.hoisted(() => vi.fn());
const executeRouteHandlerTargetMock = vi.hoisted(() => vi.fn());

vi.mock('../../../next/phase-artifacts', () => ({
  synchronizeRouteHandlerPhaseArtifacts:
    synchronizeRouteHandlerPhaseArtifactsMock
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

describe('runtime index fresh execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    synchronizeRouteHandlerPhaseArtifactsMock.mockResolvedValue(undefined);
  });

  it('executes the single-target path directly and marks generate runs as build-owned', async () => {
    const freshResult = createPipelineResult({
      analyzedCount: 2,
      heavyCount: 2
    });
    const resolvedConfig = createResolvedConfig({
      rootDir: '/tmp/app',
      targetId: 'docs'
    });

    executeRouteHandlerTargetMock.mockResolvedValue(freshResult);

    const result = await executeResolvedRouteHandlerNextPipeline({
      resolvedConfigs: [resolvedConfig],
      mode: 'generate'
    });

    expect(result).toEqual(freshResult);
    expect(synchronizeRouteHandlerPhaseArtifactsMock).toHaveBeenCalledWith({
      resolvedConfigs: [resolvedConfig],
      phase: 'build'
    });
    expect(executeRouteHandlerTargetMock).toHaveBeenCalledWith({
      config: resolvedConfig,
      mode: 'generate'
    });
    expect(mergeRouteHandlerNextResultsMock).not.toHaveBeenCalled();
  });

  it('merges fresh multi-target results without consulting a persisted cache', async () => {
    const docsConfig = createResolvedConfig({
      rootDir: '/tmp/app',
      targetId: 'docs'
    });
    const blogConfig = createResolvedConfig({
      rootDir: '/tmp/app',
      targetId: 'blog'
    });
    const docsResult = createPipelineResult({
      analyzedCount: 3,
      heavyCount: 1
    });
    const blogResult = createPipelineResult({
      analyzedCount: 4,
      heavyCount: 2
    });
    const mergedResult = createPipelineResult({
      analyzedCount: 7,
      heavyCount: 3
    });

    executeRouteHandlerTargetMock
      .mockResolvedValueOnce(docsResult)
      .mockResolvedValueOnce(blogResult);
    mergeRouteHandlerNextResultsMock.mockReturnValue(mergedResult);

    const result = await executeResolvedRouteHandlerNextPipeline({
      resolvedConfigs: [docsConfig, blogConfig],
      mode: 'analyze'
    });

    expect(result).toEqual(mergedResult);
    expect(synchronizeRouteHandlerPhaseArtifactsMock).not.toHaveBeenCalled();
    expect(executeRouteHandlerTargetMock).toHaveBeenCalledTimes(2);
    expect(mergeRouteHandlerNextResultsMock).toHaveBeenCalledWith({
      results: [docsResult, blogResult]
    });
  });
});
