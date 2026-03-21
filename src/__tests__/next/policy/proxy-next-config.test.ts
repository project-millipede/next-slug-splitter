import { describe, expect, it } from 'vitest';

import { applyRouteHandlerProxyNextConfigPolicy } from '../../../next/policy/proxy-next-config';

describe('route handler proxy next config policy', () => {
  it('keeps rewrite mode config unchanged', () => {
    const config = {
      reactStrictMode: true
    };

    expect(
      applyRouteHandlerProxyNextConfigPolicy({
        config,
        routingStrategy: {
          kind: 'rewrites',
          reason: 'development-policy-rewrites'
        }
      })
    ).toBe(config);
  });

  it('returns config unchanged in proxy mode', () => {
    const config = {
      reactStrictMode: true
    };

    expect(
      applyRouteHandlerProxyNextConfigPolicy({
        config,
        routingStrategy: {
          kind: 'proxy',
          implementation: 'synthetic-root-proxy-file',
          reason: 'development-policy-proxy'
        }
      })
    ).toBe(config);
  });
});
