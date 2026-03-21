import type { NextRequest } from 'next/server.js';
import { debugRouteHandlerProxy } from '../observability/debug-log';
import { handleRouteHandlerProxyRequest } from './request-routing';
import type { RouteHandlerProxyOptions } from './types';

/**
 * Library-owned request handler used by the generated root `proxy.ts`.
 *
 * @param request - Incoming Next proxy request.
 * @param options - Proxy runtime options captured by the generated root file.
 * @returns Final proxy response for the request.
 *
 * @remarks
 * `runtime.ts` is intentionally thin after the proxy refactor:
 * - `file-lifecycle.ts` owns root `proxy.ts` file presence
 * - `routing-state.ts` owns cache/config/pipeline loading
 * - `request-routing.ts` owns per-request decision and response creation
 *
 * That separation gives each file one architectural concern and makes the
 * comment surface much easier to understand when someone debugs the dev proxy
 * path end to end.
 */
export const proxy = async (
  request: NextRequest,
  options: RouteHandlerProxyOptions
): Promise<import('next/server.js').NextResponse> => {
  // This top-level entry log stays broader than the deeper request-routing
  // logs so development traces can confirm what exact request shape Next
  // handed to the package runtime before any proxy routing decisions run.
  debugRouteHandlerProxy('runtime:entry', {
    method: request.method,
    url: request.url,
    nextUrlPathname: request.nextUrl.pathname,
    accept: request.headers.get('accept'),
    nextData: request.headers.get('x-nextjs-data')
  });

  return handleRouteHandlerProxyRequest({
    request,
    options
  });
};
