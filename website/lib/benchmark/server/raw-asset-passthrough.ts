import {
  request as httpRequest,
  type IncomingMessage
} from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

import {
  createUpstreamUrl,
  resolveDemoTarget
} from './upstream';

/**
 * Request headers that affect the representation returned for a static asset.
 *
 * `accept-encoding` is the important addition compared with the normal facade:
 * it allows the upstream target to return the same gzip or Brotli
 * representation requested by the browser.
 */
const RAW_ASSET_REQUEST_HEADERS_TO_FORWARD = [
  'accept',
  'accept-encoding',
  'accept-language',
  'user-agent'
] as const;

/**
 * Response headers that remain valid because the asset body passes through
 * byte-for-byte.
 *
 * a. `content-type` tells the browser how to interpret the asset.
 * b. `content-encoding` is critical: compressed bytes cannot be forwarded
 *    without also preserving whether they use gzip or Brotli.
 * c. `content-length` remains valid because this path never decodes, rewrites,
 *    or re-encodes the upstream body.
 * d. `vary` preserves upstream representation selection, particularly
 *    negotiation through `Accept-Encoding`.
 *
 * Only scalar values are copied. Duplicated values represented as arrays are
 * omitted.
 */
const RAW_ASSET_RESPONSE_HEADERS_TO_FORWARD = [
  'content-type',
  'content-encoding',
  'content-length',
  'vary'
] as const;

/**
 * Cache policy for raw benchmark assets.
 *
 * a. `no-store` prevents the browser or an intermediary from reusing the
 *    response in another benchmark run.
 * b. `no-transform` is measurement-critical: intermediaries must not decode,
 *    recompress, or otherwise change the representation measured through
 *    `PerformanceResourceTiming.encodedBodySize`.
 *
 * `max-age=0` and `must-revalidate` are redundant once `no-store` prohibits
 * storage. The legacy `Pragma` and `Expires` equivalents are also unnecessary.
 */
const RAW_ASSET_CACHE_CONTROL = 'no-store, no-transform';

/**
 * Successful response statuses that prohibit a message body.
 *
 * a. `204 No Content` reports that the request succeeded without returning a
 *    representation.
 * b. `205 Reset Content` reports success and asks the client to reset the
 *    document view, such as clearing a submitted form; it also has no content.
 *
 * Static asset targets are not expected to return either status. This guard
 * prevents the facade from constructing a `Response` with a forbidden body if
 * an upstream target does so. All `3xx` responses, including
 * `304 Not Modified`, fall back to the normal facade before this set is
 * consulted.
 */
const RESPONSE_STATUSES_WITHOUT_BODY = new Set([204, 205]);

type RawAssetTransportClient =
  | typeof httpRequest
  | typeof httpsRequest;

/**
 * Select the Node transport client matching the upstream protocol.
 *
 * @param upstreamUrl Target asset URL.
 * @returns HTTP or HTTPS request function.
 */
const selectRawAssetTransportClient = (
  upstreamUrl: URL
): RawAssetTransportClient =>
  upstreamUrl.protocol === 'https:' ? httpsRequest : httpRequest;

/**
 * Copy browser representation headers to the raw upstream request.
 *
 * Cookies, cache validators, range requests, and hop-by-hop headers are not
 * forwarded.
 *
 * @param request Browser-visible facade request.
 * @returns Headers for the raw upstream request.
 */
const createRawAssetRequestHeaders = (
  request: Request
): Record<string, string> => {
  const headers: Record<string, string> = {};

  for (const headerName of RAW_ASSET_REQUEST_HEADERS_TO_FORWARD) {
    const headerValue = request.headers.get(headerName);

    if (headerValue != null) {
      headers[headerName] = headerValue;
    }
  }

  return headers;
};

/**
 * Check whether upstream compression metadata can be forwarded unambiguously.
 *
 * An absent value represents an uncompressed response. A scalar value
 * describes the untouched body. Duplicated values fall back to the normal
 * facade because compressed bytes must never be forwarded without one
 * unambiguous `Content-Encoding` value.
 *
 * @param upstreamResponse Raw upstream response.
 * @returns Whether its compression metadata can accompany the raw body.
 */
const hasForwardableContentEncoding = (
  upstreamResponse: IncomingMessage
): boolean => {
  const contentEncoding =
    upstreamResponse.headers['content-encoding'];

  return (
    contentEncoding == null ||
    typeof contentEncoding === 'string'
  );
};

/**
 * Create headers for an untouched compressed asset response.
 *
 * The sequence is:
 *
 * 1. Copy scalar headers describing the untouched representation.
 * 2. Prevent cache reuse and transformations that would invalidate the
 *    browser-observed compressed size.
 * 3. Apply the normal facade diagnostics.
 *
 * @param upstreamResponse Raw upstream asset response.
 * @param targetId Target application identifier.
 * @returns Browser-visible response headers.
 */
const createRawAssetResponseHeaders = (
  upstreamResponse: IncomingMessage,
  targetId: string
): Headers => {
  const headers = new Headers();

  for (const headerName of RAW_ASSET_RESPONSE_HEADERS_TO_FORWARD) {
    const headerValue = upstreamResponse.headers[headerName];

    if (typeof headerValue === 'string') {
      headers.set(headerName, headerValue);
    }
  }

  headers.set('cache-control', RAW_ASSET_CACHE_CONTROL);
  headers.set('x-robots-tag', 'noindex, nofollow');
  headers.set('x-benchmark-target', targetId);

  return headers;
};

/**
 * Convert the Node response stream into the Web stream accepted by `Response`.
 *
 * Node and DOM declare separate TypeScript interfaces for the same Web Streams
 * runtime contract, so the conversion requires a local type bridge.
 *
 * @param upstreamResponse Raw upstream response stream.
 * @returns Untouched streaming response body.
 */
const createRawAssetResponseBody = (
  upstreamResponse: IncomingMessage
): ReadableStream<Uint8Array> =>
  Readable.toWeb(upstreamResponse) as unknown as ReadableStream<Uint8Array>;

/**
 * Check whether a response must return through the normal facade.
 *
 * Redirects require the existing facade because it rewrites target locations
 * into same-origin zone paths.
 *
 * @param status Upstream response status.
 * @returns Whether the status represents a redirect.
 */
const isRedirectStatus = (status: number): boolean =>
  status >= 300 && status < 400;

/**
 * Forward one asset while preserving its compressed bytes.
 *
 * This deliberately uses the Node HTTP transport instead of `fetch`:
 *
 * 1. Node exposes the response body before automatic content decoding.
 * 2. The browser request's abort signal cancels the upstream request.
 * 3. Redirects and ambiguous compression metadata fall back to the normal
 *    facade.
 * 4. The untouched body and `Content-Encoding` reach the browser together, so
 *    `encodedBodySize` describes the transferred upstream representation.
 *
 * See `docs/architecture/facade/raw-passthrough.svg` for the complete request
 * and response flow compared with the normal facade path.
 *
 * @param request Browser-visible facade request.
 * @param upstreamUrl Resolved target asset URL.
 * @param targetId Target application identifier.
 * @returns Raw response, or null when the normal facade must handle it.
 */
const forwardRawAssetRequest = (
  request: Request,
  upstreamUrl: URL,
  targetId: string
): Promise<Response | null> =>
  new Promise((resolve, reject) => {
    const transportClient =
      selectRawAssetTransportClient(upstreamUrl);
    const nodeRequest = transportClient(
      upstreamUrl,
      {
        method: request.method,
        headers: createRawAssetRequestHeaders(request),
        signal: request.signal
      },
      upstreamResponse => {
        upstreamResponse.once('error', reject);

        const status = upstreamResponse.statusCode;

        if (status == null || status < 200 || status > 599) {
          upstreamResponse.destroy();
          reject(
            new Error(
              `Invalid upstream asset response status for "${upstreamUrl}".`
            )
          );
          return;
        }

        if (
          isRedirectStatus(status) ||
          !hasForwardableContentEncoding(upstreamResponse)
        ) {
          upstreamResponse.resume();
          resolve(null);
          return;
        }

        const headers = createRawAssetResponseHeaders(
          upstreamResponse,
          targetId
        );
        const responseHasBody =
          !RESPONSE_STATUSES_WITHOUT_BODY.has(status);

        if (!responseHasBody) {
          upstreamResponse.resume();
          headers.delete('content-encoding');
          headers.delete('content-length');
        }

        resolve(
          new Response(
            responseHasBody
              ? createRawAssetResponseBody(upstreamResponse)
              : null,
            {
              status,
              statusText: upstreamResponse.statusMessage,
              headers
            }
          )
        );
      }
    );

    nodeRequest.once('error', reject);
    nodeRequest.end();
  });

/**
 * Forward a GET asset without decoding its upstream representation.
 *
 * It returns null when any of the following conditions hold:
 *
 * 1. The request method is not `GET`.
 * 2. The target does not exist.
 * 3. The upstream response requires normal facade handling.
 *
 * @param request Browser-visible asset request.
 * @param targetId Target id from the zone route.
 * @param pathSegments Asset path inside the target application.
 * @returns Raw compressed response, or null for the existing facade path.
 */
export const tryForwardRawAssetRequest = async (
  request: Request,
  targetId: string,
  pathSegments: ReadonlyArray<string>
): Promise<Response | null> => {
  if (request.method !== 'GET') {
    return null;
  }

  const target = resolveDemoTarget(targetId);

  if (target == null) {
    return null;
  }

  const requestUrl = new URL(request.url);
  const upstreamUrl = createUpstreamUrl(
    target,
    pathSegments,
    requestUrl.search
  );

  return forwardRawAssetRequest(request, upstreamUrl, target.id);
};
