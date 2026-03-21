import { describe, expect, it } from 'vitest';

import { analyzeRouteHandlerProxyRequestShape } from '../../../../next/proxy/runtime/request-shape';

import type { NextRequest } from 'next/server.js';

const createProxyRequest = (
  url: string,
  options: {
    headers?: Record<string, string>;
  } = {}
): NextRequest =>
  ({
    url,
    headers: new Headers(options.headers),
    nextUrl: new URL(url)
  }) as NextRequest;

describe('proxy request shape', () => {
  it('identifies a regular page request', () => {
    expect(
      analyzeRouteHandlerProxyRequestShape(
        createProxyRequest('https://example.com/de/docs/ai/reverse')
      )
    ).toEqual({
      kind: 'page',
      publicPathname: '/de/docs/ai/reverse'
    });
  });

  it('treats x-nextjs-data requests as data transport', () => {
    expect(
      analyzeRouteHandlerProxyRequestShape(
        createProxyRequest('https://example.com/de/docs/ai/reverse', {
          headers: {
            'x-nextjs-data': '1'
          }
        })
      )
    ).toEqual({
      kind: 'data',
      publicPathname: '/de/docs/ai/reverse'
    });
  });
});
