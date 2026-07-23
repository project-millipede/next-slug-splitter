import { describe, expect, test } from 'vitest';

import type {
  ComparisonDemoTarget,
  DemoRoute
} from '../../../lib/benchmark/catalog';

import {
  parseRoutePayloadManifest,
  resolveRoutePayload
} from './payload-manifest';
import type { RoutePayloadManifest } from './types';

const TARGET: ComparisonDemoTarget = {
  id: 'page-router',
  label: 'Pages Router',
  role: 'comparison',
  zonePath: '/zones/page-router',
  originEnvName: 'BENCHMARK_PAGE_ROUTER_ORIGIN',
  localOrigin: 'http://127.0.0.1:4003',
  appUrl: 'https://next-slug-splitter-page-router-demo.vercel.app',
  baselineTargetId: 'page-router-heavy'
};

const ZERO_PAYLOAD_ROUTE: DemoRoute = {
  targetId: TARGET.id,
  path: '/docs/getting-started',
  label: 'Getting started',
  kind: 'light'
};

const PAYLOAD_ROUTE: DemoRoute = {
  targetId: TARGET.id,
  path: '/docs/interactive',
  label: 'Interactive demo',
  kind: 'heavy'
};

const PAYLOAD_CHUNK = '/zones/page-router/_next/static/chunks/payload.js';

const PAYLOAD_MANIFEST: RoutePayloadManifest = {
  routes: {
    [PAYLOAD_ROUTE.path]: {
      generatedHandlerPath: '/docs/generated-handlers/interactive/en',
      payloadChunk: PAYLOAD_CHUNK
    }
  }
};

describe('route payload manifest parsing', () => {
  test('accepts a valid payload entry', () => {
    expect(parseRoutePayloadManifest(PAYLOAD_MANIFEST, TARGET.label)).toEqual(
      PAYLOAD_MANIFEST
    );
  });

  test('rejects an entry without a selected payload path', () => {
    expect(() =>
      parseRoutePayloadManifest(
        {
          routes: {
            [PAYLOAD_ROUTE.path]: {
              generatedHandlerPath: null,
              payloadChunk: null
            }
          }
        },
        TARGET.label
      )
    ).toThrow('Invalid route payload manifest served by Pages Router.');
  });
});

describe('route payload resolution', () => {
  test('returns the payload through existing metadata', () => {
    expect(
      resolveRoutePayload(
        PAYLOAD_MANIFEST,
        PAYLOAD_ROUTE,
        TARGET,
        'splitter'
      )
    ).toEqual({
      metadata: {
        generatedHandlerPath: '/docs/generated-handlers/interactive/en'
      },
      payloadChunk: PAYLOAD_CHUNK
    });
  });

  test('turns only an explicitly expected absent splitter entry into zero', () => {
    expect(
      resolveRoutePayload(
        { routes: {} },
        ZERO_PAYLOAD_ROUTE,
        TARGET,
        'splitter'
      )
    ).toEqual({
      metadata: {
        generatedHandlerPath: null
      },
      payloadChunk: null
    });
  });

  test('rejects a missing splitter entry when a payload is expected', () => {
    expect(() =>
      resolveRoutePayload(
        { routes: {} },
        PAYLOAD_ROUTE,
        TARGET,
        'splitter'
      )
    ).toThrow(
      'Missing splitter route payload entry for "/docs/interactive" in Pages Router.'
    );
  });

  test('rejects a missing heavy-baseline entry', () => {
    expect(() =>
      resolveRoutePayload(
        { routes: {} },
        ZERO_PAYLOAD_ROUTE,
        TARGET,
        'heavy-baseline'
      )
    ).toThrow(
      'Missing heavy-baseline route payload entry for "/docs/getting-started" in Pages Router.'
    );
  });

  test('rejects a payload owned by another target facade', () => {
    expect(() =>
      resolveRoutePayload(
        {
          routes: {
            [PAYLOAD_ROUTE.path]: {
              generatedHandlerPath: null,
              payloadChunk:
                '/zones/app-router-multi-locale/_next/static/chunks/payload.js'
            }
          }
        },
        PAYLOAD_ROUTE,
        TARGET,
        'splitter'
      )
    ).toThrow('does not belong to Pages Router.');
  });
});
