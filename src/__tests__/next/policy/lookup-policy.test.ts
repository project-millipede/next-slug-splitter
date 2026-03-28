import { describe, expect, test, vi } from 'vitest';

import { resolveRouteHandlerLookupPolicy } from '../../../next/policy/lookup-policy';

describe('route handler lookup policy', () => {
  type Scenario = {
    id: string;
    description: string;
    nodeEnv: 'development' | 'production';
    developmentRoutingMode: 'proxy' | 'rewrites';
    expected: {
      readPersistedLazyDiscoveries: boolean;
      allowGenerateFallback: boolean;
    };
  };

  const scenarios: ReadonlyArray<Scenario> = [
    {
      id: 'Dev-Proxy',
      description: 'development proxy lookup stays read-only and best-effort',
      nodeEnv: 'development',
      developmentRoutingMode: 'proxy',
      expected: {
        readPersistedLazyDiscoveries: true,
        allowGenerateFallback: false
      }
    },
    {
      id: 'Dev-Rewrites',
      description: 'development rewrite lookup keeps the exact analyze-fallback contract',
      nodeEnv: 'development',
      developmentRoutingMode: 'rewrites',
      expected: {
        readPersistedLazyDiscoveries: false,
        allowGenerateFallback: true
      }
    },
    {
      id: 'Prod',
      description: 'non-development lookup keeps the stable exact analyze-fallback contract',
      nodeEnv: 'production',
      developmentRoutingMode: 'proxy',
      expected: {
        readPersistedLazyDiscoveries: false,
        allowGenerateFallback: true
      }
    }
  ];

  test.for(scenarios)('[$id] $description', ({
    nodeEnv,
    developmentRoutingMode,
    expected
  }) => {
    vi.stubEnv('NODE_ENV', nodeEnv);

    expect(
      resolveRouteHandlerLookupPolicy({
        routingPolicy: {
          development: developmentRoutingMode
        }
      })
    ).toEqual(expected);
  });
});
