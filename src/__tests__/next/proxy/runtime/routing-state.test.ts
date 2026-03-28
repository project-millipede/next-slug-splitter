import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock(import('../../../../next/proxy/runtime/bootstrap-state'), () => ({
  getRouteHandlerProxyBootstrapState: vi.fn(),
  clearRouteHandlerProxyBootstrapStateCache: vi.fn()
}));

import * as bootstrapState from '../../../../next/proxy/runtime/bootstrap-state';
import { getRouteHandlerProxyRoutingState } from '../../../../next/proxy/runtime/routing-state';

describe('proxy routing state', () => {
  const getRouteHandlerProxyBootstrapStateMock = vi.mocked(
    bootstrapState.getRouteHandlerProxyBootstrapState
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  type Scenario = {
    id: string;
    description: string;
    bootstrapState: Awaited<
      ReturnType<typeof bootstrapState.getRouteHandlerProxyBootstrapState>
    >;
    expected: {
      targetRouteBasePaths: Array<string>;
      hasConfiguredTargets: boolean;
      bootstrapGenerationToken: string;
    };
  };

  const scenarios: ReadonlyArray<Scenario> = [
    {
      id: 'Configured-Targets',
      description: 'returns lightweight bootstrap-derived routing metadata',
      bootstrapState: {
        hasConfiguredTargets: true,
        targetRouteBasePaths: ['/blog'],
        bootstrapGenerationToken: 'bootstrap-1'
      },
      expected: {
        targetRouteBasePaths: ['/blog'],
        hasConfiguredTargets: true,
        bootstrapGenerationToken: 'bootstrap-1'
      }
    },
    {
      id: 'No-Configured-Targets',
      description: 'returns a no-op state when no splitter config is available',
      bootstrapState: {
        hasConfiguredTargets: false,
        targetRouteBasePaths: [],
        bootstrapGenerationToken: 'bootstrap-2'
      },
      expected: {
        targetRouteBasePaths: [],
        hasConfiguredTargets: false,
        bootstrapGenerationToken: 'bootstrap-2'
      }
    }
  ];

  test.for(scenarios)('[$id] $description', async ({
    bootstrapState,
    expected
  }) => {
    getRouteHandlerProxyBootstrapStateMock.mockResolvedValue(bootstrapState);

    const state = await getRouteHandlerProxyRoutingState({
      locales: ['en'],
      defaultLocale: 'en'
    });

    expect(state.rewriteBySourcePath.size).toBe(0);
    expect(state.targetRouteBasePaths).toEqual(expected.targetRouteBasePaths);
    expect(state.hasConfiguredTargets).toBe(expected.hasConfiguredTargets);
    expect(state.bootstrapGenerationToken).toBe(
      expected.bootstrapGenerationToken
    );
  });
});
