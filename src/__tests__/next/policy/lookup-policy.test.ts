import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import { resolveRouteHandlerLookupPolicy } from '../../../next/policy/lookup-policy';

describe('route handler lookup policy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('makes development proxy lookup read-only by default', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(
      resolveRouteHandlerLookupPolicy({
        routingPolicy: {
          development: 'proxy'
        }
      })
    ).toEqual({
      readPersistedLazyDiscoveries: true,
      allowGenerateFallback: false
    });
  });

  it('keeps development rewrite lookup on the exact generate-fallback contract', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(
      resolveRouteHandlerLookupPolicy({
        routingPolicy: {
          development: 'rewrites'
        }
      })
    ).toEqual({
      readPersistedLazyDiscoveries: false,
      allowGenerateFallback: true
    });
  });

  it('keeps non-development lookup on the stable generate-fallback contract', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(
      resolveRouteHandlerLookupPolicy({
        routingPolicy: {
          development: 'proxy'
        }
      })
    ).toEqual({
      readPersistedLazyDiscoveries: false,
      allowGenerateFallback: true
    });
  });
});
