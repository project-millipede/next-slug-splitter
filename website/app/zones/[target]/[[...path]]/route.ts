import { forwardTargetRequest } from '../../../../lib/benchmark/server/facade';
import { tryForwardRawAssetRequest } from '../../../../lib/benchmark/server/raw-asset-passthrough';

/**
 * Use Node.js because the raw asset path relies on `node:http` and `node:https`
 * to forward compressed bytes without automatic decoding.
 */
export const runtime = 'nodejs';

/**
 * Next.js route-segment config: always run the facade for the current request.
 *
 * `/zones/[target]/*` proxies live demo apps and rewrites response headers and
 * links, so every page or asset request must be forwarded at request time.
 */
export const dynamic = 'force-dynamic';

type ZoneRequestKind = 'page' | 'asset';

type ZoneRouteContext = {
  params: Promise<{
    target: string;
    path?: string[];
  }>;
};

/**
 * Classify a zone request from its first path segment.
 *
 * Classification selects one of two forwarding paths:
 *
 * 1. A path beginning with `_next` represents a framework asset. GET requests
 *    use raw compressed passthrough when the upstream response permits it.
 * 2. Every other path represents a page and uses the normal facade, which can
 *    rewrite textual links into the same-origin zone path.
 *
 * @param path - Catch-all path segments after `/zones/[target]`.
 * @returns Facade request kind used by the forwarding helper.
 */
const getZoneRequestKind = (path: ReadonlyArray<string>): ZoneRequestKind => {
  const [firstPathSegment] = path;
  return firstPathSegment === '_next' ? 'asset' : 'page';
};

/**
 * Resolve route params and forward the request to the selected target app.
 *
 * The sequence is:
 * 1. Read the target id and catch-all path from Next route params.
 * 2. Classify the path as a page or `_next` asset request.
 * 3. Forward GET assets without decoding their upstream representation,
 *    falling back when raw forwarding is unsuitable.
 * 4. Delegate upstream fetching, header filtering, redirect rewriting, and
 *    optional textual page rewriting to the target facade helper.
 *
 * @param request - Incoming benchmark zone request.
 * @param context - Next route context containing target and path params.
 * @returns Response produced by the benchmark facade.
 */
const forwardZoneRequest = async (
  request: Request,
  context: ZoneRouteContext
): Promise<Response> => {
  const { target, path = [] } = await context.params;
  const kind = getZoneRequestKind(path);

  if (kind === 'asset') {
    const rawAssetResponse = await tryForwardRawAssetRequest(
      request,
      target,
      path
    );

    if (rawAssetResponse != null) {
      return rawAssetResponse;
    }
  }

  return forwardTargetRequest(request, target, path, kind);
};

/**
 * Serve page and asset GET requests for benchmark target resources.
 *
 * This handler is the browser-visible entry point for `/zones/[target]/*`.
 * It resolves the target route params, classifies page versus `_next` asset
 * traffic, then forwards the request through the same-origin facade.
 *
 * @param request - Incoming GET request.
 * @param context - Next route context containing target and path params.
 * @returns Facade response from the selected upstream demo target.
 */
export async function GET(request: Request, context: ZoneRouteContext) {
  return forwardZoneRequest(request, context);
}

/**
 * Serve HEAD requests for benchmark target resources.
 *
 * This follows the same sequence as GET: resolve params, classify page versus
 * asset traffic, and forward through the normal facade helper, which suppresses
 * the response body for HEAD while preserving status and headers.
 *
 * @param request - Incoming HEAD request.
 * @param context - Next route context containing target and path params.
 * @returns Header-only facade response from the selected upstream demo target.
 */
export async function HEAD(request: Request, context: ZoneRouteContext) {
  return forwardZoneRequest(request, context);
}
