import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD
} from 'next/constants.js';

import {
  ROUTE_HANDLER_DEV_ROUTING_ENV_VAR,
  resolveRouteHandlerRoutingStrategy
} from '../../../next/routing-strategy';

describe('route handler routing strategy', () => {
  const originalEnvValue =
    process.env[ROUTE_HANDLER_DEV_ROUTING_ENV_VAR];

  afterEach(() => {
    if (originalEnvValue == null) {
      delete process.env[ROUTE_HANDLER_DEV_ROUTING_ENV_VAR];
    } else {
      process.env[ROUTE_HANDLER_DEV_ROUTING_ENV_VAR] = originalEnvValue;
    }
  });

  it('defaults development to proxy through the resolved app policy', () => {
    delete process.env[ROUTE_HANDLER_DEV_ROUTING_ENV_VAR];

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
    delete process.env[ROUTE_HANDLER_DEV_ROUTING_ENV_VAR];

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
    process.env[ROUTE_HANDLER_DEV_ROUTING_ENV_VAR] = 'rewrites';

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
    process.env[ROUTE_HANDLER_DEV_ROUTING_ENV_VAR] = 'proxy';

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
    process.env[ROUTE_HANDLER_DEV_ROUTING_ENV_VAR] = 'proxy';

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
});
