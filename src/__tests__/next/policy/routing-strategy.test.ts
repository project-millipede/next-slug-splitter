import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD
} from 'next/constants.js';

import {
  ROUTE_HANDLER_DEV_ROUTING_ENV_VAR,
  resolveRouteHandlerRoutingStrategy
} from '../../../next/routing-strategy';

describe('route handler routing strategy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults development to proxy through the resolved app policy', () => {
    expect(
      resolveRouteHandlerRoutingStrategy({
        phase: PHASE_DEVELOPMENT_SERVER,
        routingPolicy: {
          development: 'proxy'
        }
      })
    ).toEqual({
      kind: 'proxy',
      implementation: 'synthetic-root-proxy-file',
      reason: 'development-policy-proxy'
    });
  });

  it('allows the resolved app policy to force rewrite mode in development', () => {
    expect(
      resolveRouteHandlerRoutingStrategy({
        phase: PHASE_DEVELOPMENT_SERVER,
        routingPolicy: {
          development: 'rewrites'
        }
      })
    ).toEqual({
      kind: 'rewrites',
      reason: 'development-policy-rewrites'
    });
  });

  it('lets the env override force rewrites even when app policy prefers proxy', () => {
    vi.stubEnv(ROUTE_HANDLER_DEV_ROUTING_ENV_VAR, 'rewrites');

    expect(
      resolveRouteHandlerRoutingStrategy({
        phase: PHASE_DEVELOPMENT_SERVER,
        routingPolicy: {
          development: 'proxy'
        }
      })
    ).toEqual({
      kind: 'rewrites',
      reason: 'environment-override-rewrites'
    });
  });

  it('lets the env override force proxy even when app policy prefers rewrites', () => {
    vi.stubEnv(ROUTE_HANDLER_DEV_ROUTING_ENV_VAR, 'proxy');

    expect(
      resolveRouteHandlerRoutingStrategy({
        phase: PHASE_DEVELOPMENT_SERVER,
        routingPolicy: {
          development: 'rewrites'
        }
      })
    ).toEqual({
      kind: 'proxy',
      implementation: 'synthetic-root-proxy-file',
      reason: 'environment-override-proxy'
    });
  });

  it('still falls back to rewrites outside development even when env override is set', () => {
    vi.stubEnv(ROUTE_HANDLER_DEV_ROUTING_ENV_VAR, 'proxy');

    expect(
      resolveRouteHandlerRoutingStrategy({
        phase: PHASE_PRODUCTION_BUILD,
        routingPolicy: {
          development: 'proxy'
        }
      })
    ).toEqual({
      kind: 'rewrites',
      reason: 'non-development-phase'
    });
  });

  it('disables proxy in production builds even when development policy prefers proxy', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(
      resolveRouteHandlerRoutingStrategy({
        phase: PHASE_PRODUCTION_BUILD,
        routingPolicy: {
          development: 'proxy'
        }
      })
    ).toEqual({
      kind: 'rewrites',
      reason: 'proxy-disabled-in-production'
    });
  });
});
