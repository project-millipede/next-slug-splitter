import type { NextRequest } from 'next/server.js';

import { debugRouteHandlerProxy } from '../observability/debug-log';

/**
 * Parsed request-shape information for one proxy request.
 *
 * @remarks
 * Next normalizes `/_next/data/...json` requests into public page pathnames
 * before the proxy sees them. The proxy therefore only receives browser-visible
 * public page URLs, even when the underlying transport was the Pages Router
 * data path.
 *
 * The `kind` field is kept for diagnostic completeness: if Next ever delivers
 * a request with the `x-nextjs-data` header, the debug log will still
 * distinguish it. The routing decision is never affected by `kind`.
 */
export type RouteHandlerProxyRequestShape =
  | {
      kind: 'page';
      /**
       * Browser-visible public pathname.
       */
      publicPathname: string;
    }
  | {
      kind: 'data';
      /**
       * Browser-visible public pathname represented by the data request.
       */
      publicPathname: string;
    };

/**
 * Read the exact browser-visible pathname from the raw request URL.
 *
 * @param request - Incoming proxy request.
 * @returns Raw request pathname.
 */
const readRawRequestPathname = (request: NextRequest): string =>
  new URL(request.url).pathname;

/**
 * Read whether Next marked the request as a Pages Router data transport.
 *
 * @param request - Incoming proxy request.
 * @returns `true` when Next attached the data-request header.
 *
 * @remarks
 * This is a lightweight diagnostic check. With normalization enabled, data
 * requests arrive as public pathnames, so this header is the only remaining
 * signal that the original browser request was a client-side transition.
 */
const isHeaderMarkedNextDataRequest = (request: NextRequest): boolean =>
  request.headers.get('x-nextjs-data') != null;

/**
 * Parse the proxy request into one stable public-route identity.
 *
 * @param request - Incoming proxy request.
 * @returns Normalized request shape for the proxy runtime.
 *
 * @remarks
 * With URL normalization enabled, the proxy only receives public page
 * pathnames. The `x-nextjs-data` header is still checked so the runtime can
 * distinguish ordinary page requests from Pages Router data transport when
 * a dev-only stabilization safeguard needs that separation.
 */
export const analyzeRouteHandlerProxyRequestShape = (
  request: NextRequest
): RouteHandlerProxyRequestShape => {
  const rawPathname = readRawRequestPathname(request);

  if (isHeaderMarkedNextDataRequest(request)) {
    const requestShape: RouteHandlerProxyRequestShape = {
      kind: 'data',
      publicPathname: rawPathname
    };

    debugRouteHandlerProxy('request-shape:data', {
      rawPathname,
      publicPathname: requestShape.publicPathname,
      inferredFromHeader: true
    });

    return requestShape;
  }

  const requestShape: RouteHandlerProxyRequestShape = {
    kind: 'page',
    publicPathname: rawPathname
  };

  debugRouteHandlerProxy('request-shape:page', {
    rawPathname,
    publicPathname: requestShape.publicPathname
  });

  return requestShape;
};
