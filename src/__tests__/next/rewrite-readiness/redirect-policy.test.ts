import { describe, expect, it } from 'vitest';

import { resolveRouteHandlerProxyRewriteResponseDecision } from '../../../next/rewrite-readiness';

import type { NextRequest } from 'next/server.js';
import type { RouteHandlerProxyDecision } from '../../../next/proxy/runtime/types';

const createProxyRequest = ({
  method = 'GET',
  headers = {}
}: {
  method?: string;
  headers?: Record<string, string>;
} = {}): NextRequest =>
  ({
    url: 'https://example.com/docs/interactive',
    method,
    headers: new Headers({
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...headers
    }),
    nextUrl: new URL('https://example.com/docs/interactive'),
    cookies: {
      get: () => undefined
    }
  }) as NextRequest;

const createRewriteDecision = (): RouteHandlerProxyDecision => ({
  kind: 'rewrite',
  pathname: '/docs/interactive',
  routeBasePaths: ['/docs'],
  rewriteDestination: '/docs/_handlers/interactive'
});

describe('proxy rewrite redirect policy', () => {
  it('redirects the primary HTML navigation request when an updated handler rewrite is flagged', () => {
    const responseDecision = resolveRouteHandlerProxyRewriteResponseDecision(
      createProxyRequest(),
      {
        kind: 'page',
        publicPathname: '/docs/interactive'
      },
      createRewriteDecision(),
      true
    );

    expect(responseDecision).toEqual({
      kind: 'redirect',
      pathname: '/docs/interactive',
      routeBasePaths: ['/docs'],
      redirectDestination: '/docs/interactive'
    });
  });

  it('keeps a HEAD request on the fast rewrite path even when an updated handler rewrite is flagged', () => {
    const responseDecision = resolveRouteHandlerProxyRewriteResponseDecision(
      createProxyRequest({
        method: 'HEAD'
      }),
      {
        kind: 'page',
        publicPathname: '/docs/interactive'
      },
      createRewriteDecision(),
      true
    );

    expect(responseDecision).toEqual(createRewriteDecision());
  });

  it('keeps Pages Router data transport on the fast rewrite path even when an updated handler rewrite is flagged', () => {
    const responseDecision = resolveRouteHandlerProxyRewriteResponseDecision(
      createProxyRequest({
        headers: {
          accept: '*/*',
          'x-nextjs-data': '1'
        }
      }),
      {
        kind: 'data',
        publicPathname: '/docs/interactive'
      },
      createRewriteDecision(),
      true
    );

    expect(responseDecision).toEqual(createRewriteDecision());
  });

  it('leaves ordinary rewrites unchanged when no updated handler rewrite is flagged', () => {
    const responseDecision = resolveRouteHandlerProxyRewriteResponseDecision(
      createProxyRequest(),
      {
        kind: 'page',
        publicPathname: '/docs/interactive'
      },
      {
        kind: 'rewrite',
        pathname: '/docs/interactive',
        routeBasePaths: ['/docs'],
        rewriteDestination: '/docs/_handlers/interactive'
      },
      false
    );

    expect(responseDecision).toEqual({
      kind: 'rewrite',
      pathname: '/docs/interactive',
      routeBasePaths: ['/docs'],
      rewriteDestination: '/docs/_handlers/interactive'
    });
  });
});
