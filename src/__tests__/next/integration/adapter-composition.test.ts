import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';
import { describe, expect, it, vi } from 'vitest';

import type { NextAdapter, NextConfig } from 'next';

import { composeNextAdapters } from '../../../next/integration';

/**
 * Value-level template used to derive the adapter hook types through type
 * queries instead of indexed access on `NextAdapter`.
 */
const TEST_TEMPLATE_ADAPTER: NextAdapter = {
  name: 'template-adapter'
};

type ModifyConfig = NonNullable<typeof TEST_TEMPLATE_ADAPTER.modifyConfig>;
type OnBuildComplete = NonNullable<
  typeof TEST_TEMPLATE_ADAPTER.onBuildComplete
>;

/**
 * Test-facing hook signatures built from public Next types only.
 *
 * The real hooks consume Next's internal resolved config, a subtype of the
 * public `NextConfig`, so the narrowed parameters widen safely. The tests
 * never consume the resolved config result, so `Promise<never>` is the only
 * modifyConfig return assignable to the real hook's return without naming
 * Next's internal complete-config type.
 */
type StubModifyConfig = (
  config: NextConfig,
  context: {
    phase: string;
    nextVersion: string;
  }
) => Promise<never>;

type StubOnBuildComplete = (context: {
  distDir: string;
}) => Promise<void> | void;

const TEST_NEXT_CONFIG: NextConfig = {
  reactStrictMode: true
};

const TEST_MODIFY_CONFIG_CONTEXT = {
  phase: PHASE_PRODUCTION_BUILD,
  nextVersion: '16.2.0'
};

const TEST_BUILD_COMPLETE_CONTEXT = {
  distDir: '/repo/app/.next'
};

/**
 * Invoke the composed adapter's modifyConfig hook with the shared context.
 *
 * @param composedAdapter - Adapter returned by `composeNextAdapters(...)`.
 * @param config - Public-typed Next config fixture for the invocation.
 * @returns Resolved config produced by the composed pipeline.
 */
const invokeComposedModifyConfig = async (
  composedAdapter: NextAdapter,
  config: NextConfig
): Promise<unknown> => {
  const modifyConfig = composedAdapter.modifyConfig as
    | StubModifyConfig
    | undefined;

  expect(modifyConfig).toBeTypeOf('function');

  return await modifyConfig?.(config, TEST_MODIFY_CONFIG_CONTEXT);
};

/**
 * Invoke the composed adapter's onBuildComplete hook with the shared context.
 *
 * @param composedAdapter - Adapter returned by `composeNextAdapters(...)`.
 * @returns Promise resolving after the hook completes.
 */
const invokeComposedOnBuildComplete = async (
  composedAdapter: NextAdapter
): Promise<void> => {
  const onBuildComplete = composedAdapter.onBuildComplete as
    | StubOnBuildComplete
    | undefined;

  expect(onBuildComplete).toBeTypeOf('function');

  await onBuildComplete?.(TEST_BUILD_COMPLETE_CONTEXT);
};

describe('composeNextAdapters', () => {
  it('names every composed adapter with the shared slug-splitter identity', () => {
    expect(
      composeNextAdapters(
        { name: 'first-adapter' },
        { name: 'second-adapter' }
      ).name
    ).toBe('slug-splitter-adapter');
    expect(composeNextAdapters().name).toBe('slug-splitter-adapter');
  });

  it('filters out undefined adapters before composing', async () => {
    const modifyConfig = vi.fn<ModifyConfig>(config => config);
    const composedAdapter = composeNextAdapters(
      undefined,
      {
        name: 'present-adapter',
        modifyConfig
      },
      undefined
    );

    await invokeComposedModifyConfig(composedAdapter, TEST_NEXT_CONFIG);

    expect(modifyConfig).toHaveBeenCalledTimes(1);
  });

  it('pipes modifyConfig through every adapter in the provided order', async () => {
    /**
     * Named trace of what each pipeline stage received and produced, so the
     * assertions read every position by name instead of indexing into mock
     * internals.
     */
    const pipelineTrace: {
      firstStageInput?: NextConfig;
      firstStageContext?: unknown;
      firstStageOutput?: NextConfig;
      secondStageInput?: NextConfig;
      secondStageContext?: unknown;
      secondStageOutput?: NextConfig;
    } = {};

    // Each stage returns a fresh copy of its input, so the pipeline is
    // traceable through object identity alone: a pure identity function
    // would hand every stage the same object and hide the chaining.
    const firstModifyConfig: ModifyConfig = (config, context) => {
      const stageOutput = { ...config };

      pipelineTrace.firstStageInput = config;
      pipelineTrace.firstStageContext = context;
      pipelineTrace.firstStageOutput = stageOutput;

      return stageOutput;
    };
    const secondModifyConfig: ModifyConfig = (config, context) => {
      const stageOutput = { ...config };

      pipelineTrace.secondStageInput = config;
      pipelineTrace.secondStageContext = context;
      pipelineTrace.secondStageOutput = stageOutput;

      return stageOutput;
    };
    const composedAdapter = composeNextAdapters(
      {
        name: 'first-adapter',
        modifyConfig: firstModifyConfig
      },
      {
        name: 'second-adapter',
        modifyConfig: secondModifyConfig
      }
    );

    const resolvedConfig = await invokeComposedModifyConfig(
      composedAdapter,
      TEST_NEXT_CONFIG
    );

    expect(pipelineTrace.firstStageInput).toBe(TEST_NEXT_CONFIG);
    expect(pipelineTrace.firstStageContext).toBe(TEST_MODIFY_CONFIG_CONTEXT);
    expect(pipelineTrace.secondStageInput).toBe(
      pipelineTrace.firstStageOutput
    );
    expect(pipelineTrace.secondStageContext).toBe(TEST_MODIFY_CONFIG_CONTEXT);
    expect(resolvedConfig).toBe(pipelineTrace.secondStageOutput);
  });

  it('skips adapters without modifyConfig inside the pipeline', async () => {
    const stageTrace: {
      stageInput?: NextConfig;
      stageOutput?: NextConfig;
    } = {};

    const modifyConfig: ModifyConfig = config => {
      const stageOutput = { ...config };

      stageTrace.stageInput = config;
      stageTrace.stageOutput = stageOutput;

      return stageOutput;
    };
    const composedAdapter = composeNextAdapters(
      { name: 'name-only-adapter' },
      {
        name: 'config-adapter',
        modifyConfig
      }
    );

    const resolvedConfig = await invokeComposedModifyConfig(
      composedAdapter,
      TEST_NEXT_CONFIG
    );

    expect(stageTrace.stageInput).toBe(TEST_NEXT_CONFIG);
    expect(resolvedConfig).toBe(stageTrace.stageOutput);
  });

  it('omits modifyConfig when no adapter implements it', () => {
    const composedAdapter = composeNextAdapters(
      { name: 'first-adapter' },
      { name: 'second-adapter' }
    );

    expect(composedAdapter.modifyConfig).toBeUndefined();
  });

  it('runs onBuildComplete for every adapter in order with the same context', async () => {
    /**
     * Named trace of the side-effect sequence: the executed-adapter list
     * pins the order and the named context fields pin identity, so no mock
     * internals need indexing.
     */
    const buildCompleteTrace: {
      executedAdapters: Array<string>;
      firstReceivedContext?: unknown;
      secondReceivedContext?: unknown;
    } = {
      executedAdapters: []
    };

    const firstOnBuildComplete: OnBuildComplete = context => {
      buildCompleteTrace.executedAdapters.push('first-adapter');
      buildCompleteTrace.firstReceivedContext = context;
    };
    const secondOnBuildComplete: OnBuildComplete = context => {
      buildCompleteTrace.executedAdapters.push('second-adapter');
      buildCompleteTrace.secondReceivedContext = context;
    };
    const composedAdapter = composeNextAdapters(
      {
        name: 'first-adapter',
        onBuildComplete: firstOnBuildComplete
      },
      {
        name: 'second-adapter',
        onBuildComplete: secondOnBuildComplete
      }
    );

    await invokeComposedOnBuildComplete(composedAdapter);

    expect(buildCompleteTrace.executedAdapters).toEqual([
      'first-adapter',
      'second-adapter'
    ]);
    expect(buildCompleteTrace.firstReceivedContext).toBe(
      TEST_BUILD_COMPLETE_CONTEXT
    );
    expect(buildCompleteTrace.secondReceivedContext).toBe(
      TEST_BUILD_COMPLETE_CONTEXT
    );
  });

  it('omits onBuildComplete when no adapter implements it', () => {
    const composedAdapter = composeNextAdapters({
      name: 'config-only-adapter',
      modifyConfig: vi.fn<ModifyConfig>(config => config)
    });

    expect(composedAdapter.onBuildComplete).toBeUndefined();
  });
});
