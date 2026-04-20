import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD
} from 'next/constants.js';

import {
  ROUTE_HANDLER_DEV_ROUTING_ENV_VAR,
  resolveRouteHandlerRoutingStrategy
} from '../../../next/shared/policy/routing-strategy';

describe('route handler routing strategy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults development to proxy through the resolved app policy', () => {
    expect(
      resolveRouteHandlerRoutingStrategy(PHASE_DEVELOPMENT_SERVER, {
        development: 'proxy',
        workerPrewarm: 'off'
      })
    ).toEqual({
      kind: 'proxy',
      reason: 'development-policy-proxy'
    });
  });

  it('allows the resolved app policy to force rewrite mode in development', () => {
    expect(
      resolveRouteHandlerRoutingStrategy(PHASE_DEVELOPMENT_SERVER, {
        development: 'rewrites',
        workerPrewarm: 'off'
      })
    ).toEqual({
      kind: 'rewrites',
      reason: 'development-policy-rewrites'
    });
  });

  it('lets the env override force rewrites even when app policy prefers proxy', () => {
    vi.stubEnv(ROUTE_HANDLER_DEV_ROUTING_ENV_VAR, 'rewrites');

    expect(
      resolveRouteHandlerRoutingStrategy(PHASE_DEVELOPMENT_SERVER, {
        development: 'proxy',
        workerPrewarm: 'off'
      })
    ).toEqual({
      kind: 'rewrites',
      reason: 'environment-override-rewrites'
    });
  });

  it('lets the env override force proxy even when app policy prefers rewrites', () => {
    vi.stubEnv(ROUTE_HANDLER_DEV_ROUTING_ENV_VAR, 'proxy');

    expect(
      resolveRouteHandlerRoutingStrategy(PHASE_DEVELOPMENT_SERVER, {
        development: 'rewrites',
        workerPrewarm: 'off'
      })
    ).toEqual({
      kind: 'proxy',
      reason: 'environment-override-proxy'
    });
  });

  it('still falls back to rewrites outside development even when env override is set', () => {
    vi.stubEnv(ROUTE_HANDLER_DEV_ROUTING_ENV_VAR, 'proxy');

    expect(
      resolveRouteHandlerRoutingStrategy(PHASE_PRODUCTION_BUILD, {
        development: 'proxy',
        workerPrewarm: 'off'
      })
    ).toEqual({
      kind: 'rewrites',
      reason: 'non-development-phase'
    });
  });

  it('disables proxy in production builds even when development policy prefers proxy', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(
      resolveRouteHandlerRoutingStrategy(PHASE_PRODUCTION_BUILD, {
        development: 'proxy',
        workerPrewarm: 'off'
      })
    ).toEqual({
      kind: 'rewrites',
      reason: 'proxy-disabled-in-production'
    });
  });
});
