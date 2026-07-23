import {
  createUpstreamUrl,
  resolveDemoTarget,
  type ResolvedDemoTarget
} from './upstream';

type FacadeRequestKind = 'page' | 'asset';

/**
 * Request headers forwarded to preserve proxied Next.js target behavior.
 *
 * The list keeps document negotiation, App Router RSC/prefetch navigation, and
 * browser prefetch intent intact. Cache validators are intentionally omitted so
 * target apps cannot answer measurement requests with 304 or cached variants.
 */
const REQUEST_HEADERS_TO_FORWARD = [
  'accept',
  'accept-language',
  'user-agent',
  'next-router-prefetch',
  'next-router-segment-prefetch',
  'next-router-state-tree',
  'next-url',
  'purpose',
  'rsc',
  'sec-purpose'
];

/**
 * Response headers that cannot be reused safely by the same-origin facade.
 *
 * The facade may rewrite response bodies, always enforces no-store behavior,
 * and embeds targets in a hidden measurement iframe. Hop-by-hop transport
 * headers, upstream cache validators, cookies, and frame/security policies
 * therefore have to be removed before the browser sees the response.
 */
const RESPONSE_HEADERS_TO_DROP = new Set([
  'access-control-allow-origin',
  'connection',
  'content-encoding',
  'content-length',
  'content-security-policy',
  'content-security-policy-report-only',
  'etag',
  'keep-alive',
  'last-modified',
  'proxy-authenticate',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-nextjs-cache',
  'x-nextjs-prerender',
  'x-nextjs-stale-time',
  'x-frame-options'
]);

/**
 * Page response content types that can contain target-origin URLs.
 *
 * JavaScript content types are intentionally excluded: `_next` assets are
 * classified as `asset` requests by the route handler and streamed through
 * without body rewriting.
 */
const TEXTUAL_CONTENT_TYPES = [
  'application/json',
  'text/html',
  'text/plain',
  'text/x-component'
];

/**
 * Apply no-store headers to a facade response.
 *
 * @param headers - Response headers to mutate.
 * @returns The same headers instance with cache prevention headers applied.
 */
const applyNoStoreHeaders = (headers: Headers): Headers => {
  headers.set('cache-control', 'no-store, max-age=0, must-revalidate');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  headers.set('x-robots-tag', 'noindex, nofollow');
  return headers;
};

/**
 * Create a plain text no-store response for an unknown target id.
 *
 * @param targetId - Target id that could not be resolved.
 * @returns HTTP 404 response safe for measurement requests.
 */
const createUnknownTargetResponse = (targetId: string): Response =>
  new Response(`Unknown benchmark target "${targetId}".`, {
    status: 404,
    headers: applyNoStoreHeaders(
      new Headers({
        'content-type': 'text/plain; charset=utf-8'
      })
    )
  });

/**
 * Check whether a response status represents a redirect.
 *
 * @param status - HTTP status code to inspect.
 * @returns Whether the status is in the redirect range.
 */
const isRedirectStatus = (status: number): boolean =>
  status >= 300 && status < 400;

/**
 * Check whether a content type can be safely rewritten as text.
 *
 * @param contentType - Response content type header.
 * @returns Whether the response body should be read as text.
 */
const isTextualContentType = (contentType: string | null): boolean =>
  contentType != null &&
  TEXTUAL_CONTENT_TYPES.some(type =>
    contentType.toLowerCase().startsWith(type)
  );

/**
 * Copy the small set of request headers needed by Next.js target apps.
 *
 * @param request - Incoming same-origin facade request.
 * @returns Headers forwarded to the upstream target app.
 */
const createForwardedRequestHeaders = (request: Request): Headers => {
  const headers = new Headers();

  for (const headerName of REQUEST_HEADERS_TO_FORWARD) {
    const value = request.headers.get(headerName);
    if (value != null) {
      headers.set(headerName, value);
    }
  }

  return headers;
};

/**
 * Copy safe upstream response headers for the browser-visible facade response.
 *
 * Hop-by-hop, cache, compression, cookie, and frame policy headers are removed
 * because the facade rewrites bodies, forces no-store behavior, and embeds
 * targets in a hidden measurement iframe.
 *
 * @param upstreamResponse - Response returned by the upstream target app.
 * @param target - Resolved target that produced the response.
 * @returns Headers for the benchmark facade response.
 */
const createFacadeResponseHeaders = (
  upstreamResponse: Response,
  target: ResolvedDemoTarget
): Headers => {
  const headers = new Headers();

  upstreamResponse.headers.forEach((value, key) => {
    if (!RESPONSE_HEADERS_TO_DROP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  headers.set('x-benchmark-target', target.id);
  return applyNoStoreHeaders(headers);
};

/**
 * Escape a string for literal use inside a regular expression.
 *
 * @param value - String to escape.
 * @returns Regular-expression-safe string.
 */
const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Rewrite target HTML/RSC text so links and assets stay inside the facade.
 *
 * @param text - Text response body returned by the target app.
 * @param target - Resolved target exposed through the website facade.
 * @returns Rewritten response body for the benchmark origin.
 */
const rewriteTargetText = (
  text: string,
  target: ResolvedDemoTarget
): string => {
  const originPattern = new RegExp(escapeRegExp(target.origin), 'g');
  const zonePattern = escapeRegExp(target.zonePath);
  const rootNextPattern = /(?<![\w/-])\/_next\//g;

  return text
    .replace(originPattern, '')
    .replace(rootNextPattern, `${target.zonePath}/_next/`)
    .replace(
      new RegExp(`href=(["'])/(?!_next/|zones/|https?:|#)`, 'g'),
      `href=$1${target.zonePath}/`
    )
    .replace(
      new RegExp(`href=(["'])${zonePattern}${zonePattern}/`, 'g'),
      `href=$1${target.zonePath}/`
    );
};

/**
 * Convert an upstream redirect location into a same-origin facade location.
 *
 * @param locationValue - Raw Location header from the upstream response.
 * @param upstreamUrl - Upstream URL used for resolving relative redirects.
 * @param target - Resolved target exposed through the website facade.
 * @returns Browser-visible redirect location under the target facade prefix.
 */
const toFacadeLocation = (
  locationValue: string,
  upstreamUrl: URL,
  target: ResolvedDemoTarget
): string => {
  const locationUrl = new URL(locationValue, upstreamUrl);

  if (locationUrl.origin !== target.origin) {
    return `${target.zonePath}/`;
  }

  const pathname = locationUrl.pathname.startsWith(target.zonePath)
    ? locationUrl.pathname
    : `${target.zonePath}${locationUrl.pathname}`;

  return `${pathname}${locationUrl.search}${locationUrl.hash}`;
};

/**
 * Create a redirect response whose Location header points at the facade.
 *
 * @param upstreamResponse - Redirect response returned by the target app.
 * @param upstreamUrl - Upstream URL used to resolve relative locations.
 * @param target - Resolved target exposed through the website facade.
 * @returns Redirect response safe for the benchmark origin.
 */
const createRedirectResponse = (
  upstreamResponse: Response,
  upstreamUrl: URL,
  target: ResolvedDemoTarget
): Response => {
  const headers = createFacadeResponseHeaders(upstreamResponse, target);
  const location = upstreamResponse.headers.get('location');

  if (location != null) {
    headers.set('location', toFacadeLocation(location, upstreamUrl, target));
  }

  return new Response(null, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers
  });
};

/**
 * Check whether a target page response should be text-rewritten.
 *
 * @param request - Incoming same-origin facade request.
 * @param kind - Facade request kind resolved from the path.
 * @param headers - Response headers copied from the target app.
 * @returns Whether the facade should rewrite the response body as text.
 */
const shouldRewriteTextResponse = (
  request: Request,
  kind: FacadeRequestKind,
  headers: Headers
): boolean =>
  request.method !== 'HEAD' &&
  kind === 'page' &&
  isTextualContentType(headers.get('content-type'));

/**
 * Forward a benchmark facade request to the selected target app.
 *
 * This is a route-handler helper, not a Next.js `proxy.ts` or middleware file.
 * It keeps all browser-visible target URLs same-origin while fetching the real
 * target app from its configured upstream origin.
 *
 * @param request - Incoming same-origin facade request.
 * @param targetId - Target id from the facade route segment.
 * @param pathSegments - Route or asset path segments inside the target app.
 * @param kind - Facade request kind resolved from the path.
 * @returns Response to send back from the benchmark facade.
 */
export const forwardTargetRequest = async (
  request: Request,
  targetId: string,
  pathSegments: ReadonlyArray<string>,
  kind: FacadeRequestKind
): Promise<Response> => {
  const target = resolveDemoTarget(targetId);

  if (target == null) {
    return createUnknownTargetResponse(targetId);
  }

  const requestUrl = new URL(request.url);
  const upstreamUrl = createUpstreamUrl(target, pathSegments, requestUrl.search);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers: createForwardedRequestHeaders(request),
    redirect: 'manual',
    cache: 'no-store'
  });

  if (isRedirectStatus(upstreamResponse.status)) {
    return createRedirectResponse(upstreamResponse, upstreamUrl, target);
  }

  const headers = createFacadeResponseHeaders(upstreamResponse, target);

  if (shouldRewriteTextResponse(request, kind, headers)) {
    const body = rewriteTargetText(await upstreamResponse.text(), target);
    return new Response(body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers
    });
  }

  return new Response(request.method === 'HEAD' ? null : upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers
  });
};
