import type { NextRequest } from 'next/server.js';

import type { RouteHandlerProxyRequestShape } from '../runtime/request-shape';

/**
 * Check whether the incoming proxy request uses the ordinary document
 * navigation method.
 *
 * @param request - Incoming Next proxy request.
 * @returns `true` when the request method is `GET`.
 */
const isGetRequest = (request: NextRequest): boolean =>
  request.method === 'GET';

/**
 * Check whether the normalized request shape represents an ordinary page
 * request rather than Pages Router data transport.
 *
 * @param requestShape - Normalized proxy request shape.
 * @returns `true` when the request shape is `page`.
 */
const isPageRequestShape = (
  requestShape: RouteHandlerProxyRequestShape
): boolean => requestShape.kind === 'page';

/**
 * Check whether the request advertises that it wants an HTML document
 * response.
 *
 * @param request - Incoming Next proxy request.
 * @returns `true` when the `Accept` header contains `text/html`.
 */
const acceptsHtmlDocument = (request: NextRequest): boolean => {
  const acceptHeader = request.headers.get('accept');

  if (acceptHeader == null) {
    return false;
  }

  return acceptHeader.includes('text/html');
};

/**
 * Check whether the request is the primary HTML navigation request that should
 * pay one dev-only safety redirect when a generated handler file was updated.
 *
 * @param request - Incoming Next proxy request.
 * @param requestShape - Normalized proxy request shape.
 * @returns `true` when the request is a document-style page navigation.
 *
 * @remarks
 * This deliberately excludes:
 * - Pages Router data transport (`x-nextjs-data`)
 * - non-`GET` probes such as `HEAD`
 * - requests that do not advertise HTML document acceptance
 *
 * That keeps the refresh barrier on the one primary browser navigation request
 * instead of replaying it across the follow-up request cascade.
 */
export const isPrimaryHtmlNavigationRequest = (
  request: NextRequest,
  requestShape: RouteHandlerProxyRequestShape
): boolean =>
  isGetRequest(request) &&
  isPageRequestShape(requestShape) &&
  acceptsHtmlDocument(request);
