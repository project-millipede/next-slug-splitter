import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPipelineResult } from '../../helpers/builders';

vi.mock(import('../../../next/shared/phase-artifacts'), () => ({
  synchronizeRouteHandlerPhaseArtifacts: vi.fn()
}));

vi.mock(import('../../../next/pages/runtime/target/index'), () => ({
  executeRouteHandlerTarget: vi.fn()
}));

import * as phaseArtifacts from '../../../next/shared/phase-artifacts';
import * as runtimeTarget from '../../../next/pages/runtime/target/index';
import { executeResolvedRouteHandlerNextPipeline } from '../../../next/pages/runtime';
import {
  TEST_SINGLE_LOCALE_CONFIG,
  TEST_SLUG_CATCH_ALL_ROUTE_PARAM
} from '../../helpers/fixtures';

import type { ResolvedRouteHandlersConfig } from '../../../next/pages/types';

const TEST_ROOT_DIR = '/tmp/app';

const createResolvedConfig = ({
  rootDir,
  targetId
}: {
  rootDir: string;
  targetId: string;
}): ResolvedRouteHandlersConfig => ({
  routerKind: 'pages',
  targetId,
  app: {
    rootDir,
    routing: {
      development: 'proxy',
      workerPrewarm: 'off'
    }
  },
  localeConfig: TEST_SINGLE_LOCALE_CONFIG,
  emitFormat: 'ts',
  contentLocaleMode: 'filename',
  handlerRouteParam: TEST_SLUG_CATCH_ALL_ROUTE_PARAM,
  routeContract: {
    kind: 'absolute-file',
    path: `${rootDir}/pages/content/[...slug].tsx`
  },
  processorConfig: {
    processorImport: {
      kind: 'package',
      specifier: 'test-route-handlers/processor'
    }
  },
  runtime: {
    mdxCompileOptions: {}
  },
  routeBasePath: '/content',
  paths: {
    rootDir,
    contentDir: `${rootDir}/content`,
    generatedDir: `${rootDir}/pages/content/generated-handlers`
  }
});

describe('runtime index fresh execution', () => {
  const synchronizeRouteHandlerPhaseArtifactsMock = vi.mocked(
    phaseArtifacts.synchronizeRouteHandlerPhaseArtifacts
  );
  const executeRouteHandlerTargetMock = vi.mocked(
    runtimeTarget.executeRouteHandlerTarget
  );

  beforeEach(() => {
    synchronizeRouteHandlerPhaseArtifactsMock.mockReset();
    executeRouteHandlerTargetMock.mockReset();
    synchronizeRouteHandlerPhaseArtifactsMock.mockResolvedValue(undefined);
  });

  it('executes a single target and marks generate runs as build-owned', async () => {
    const freshResult = createPipelineResult({
      analyzedCount: 2,
      heavyCount: 2
    });
    const resolvedConfig = createResolvedConfig({
      rootDir: TEST_ROOT_DIR,
      targetId: 'docs'
    });

    executeRouteHandlerTargetMock.mockResolvedValue(freshResult);

    const results = await executeResolvedRouteHandlerNextPipeline(
      [resolvedConfig],
      'generate'
    );

    expect(results).toEqual([freshResult]);
    expect(synchronizeRouteHandlerPhaseArtifactsMock).toHaveBeenCalledWith(
      [resolvedConfig],
      'build'
    );
    expect(executeRouteHandlerTargetMock).toHaveBeenCalledWith(
      resolvedConfig,
      'generate'
    );
  });

  it('returns per-target results for multi-target execution', async () => {
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

    executeRouteHandlerTargetMock
      .mockResolvedValueOnce(docsResult)
      .mockResolvedValueOnce(blogResult);

    const results = await executeResolvedRouteHandlerNextPipeline(
      [docsConfig, blogConfig],
      'analyze'
    );

    expect(results).toEqual([docsResult, blogResult]);
    expect(synchronizeRouteHandlerPhaseArtifactsMock).not.toHaveBeenCalled();
    expect(executeRouteHandlerTargetMock).toHaveBeenCalledTimes(2);
  });
});
