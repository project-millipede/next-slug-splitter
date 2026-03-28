import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPipelineResult } from '../../helpers/builders';

vi.mock(import('../../../next/phase-artifacts'), () => ({
  synchronizeRouteHandlerPhaseArtifacts: vi.fn()
}));

vi.mock(import('../../../next/runtime/shared/results'), () => ({
  mergeRouteHandlerNextResults: vi.fn()
}));

vi.mock(import('../../../next/runtime/target/index'), () => ({
  executeRouteHandlerTarget: vi.fn()
}));

import * as phaseArtifacts from '../../../next/phase-artifacts';
import * as runtimeResults from '../../../next/runtime/shared/results';
import * as runtimeTarget from '../../../next/runtime/target/index';
import { executeResolvedRouteHandlerNextPipeline } from '../../../next/runtime';

import type { ResolvedRouteHandlersConfig } from '../../../next/types';

const TEST_ROOT_DIR = '/tmp/app';

const createResolvedConfig = ({
  rootDir,
  targetId
}: {
  rootDir: string;
  targetId: string;
}): ResolvedRouteHandlersConfig => ({
    targetId,
    app: {
      rootDir,
      routing: {
        development: 'proxy'
      }
    },
    localeConfig: {
      locales: ['en'],
      defaultLocale: 'en'
    },
    emitFormat: 'ts',
    contentLocaleMode: 'filename',
    handlerRouteParam: {
      name: 'slug',
      kind: 'catch-all'
    },
    baseStaticPropsImport: {
      kind: 'absolute-file',
      path: `${rootDir}/pages/content/[...slug].tsx`
    },
    processorConfig: {
      kind: 'module',
      processorImport: {
        kind: 'package',
        specifier: 'test-route-handlers/processor'
      }
    },
    mdxCompileOptions: {},
    routeBasePath: '/content',
    paths: {
      rootDir,
      contentPagesDir: `${rootDir}/content`,
      handlersDir: `${rootDir}/pages/content/_handlers`
    },
  });

describe('runtime index fresh execution', () => {
  const synchronizeRouteHandlerPhaseArtifactsMock = vi.mocked(
    phaseArtifacts.synchronizeRouteHandlerPhaseArtifacts
  );
  const mergeRouteHandlerNextResultsMock = vi.mocked(
    runtimeResults.mergeRouteHandlerNextResults
  );
  const executeRouteHandlerTargetMock = vi.mocked(
    runtimeTarget.executeRouteHandlerTarget
  );

  beforeEach(() => {
    synchronizeRouteHandlerPhaseArtifactsMock.mockReset();
    mergeRouteHandlerNextResultsMock.mockReset();
    executeRouteHandlerTargetMock.mockReset();
    synchronizeRouteHandlerPhaseArtifactsMock.mockResolvedValue(undefined);
  });

  it('executes the single-target path directly and marks generate runs as build-owned', async () => {
    const freshResult = createPipelineResult({
      analyzedCount: 2,
      heavyCount: 2
    });
    const resolvedConfig = createResolvedConfig({
      rootDir: TEST_ROOT_DIR,
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
      rootDir: TEST_ROOT_DIR,
      targetId: 'docs'
    });
    const blogConfig = createResolvedConfig({
      rootDir: TEST_ROOT_DIR,
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
