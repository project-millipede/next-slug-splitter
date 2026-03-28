import type { NextRequest } from 'next/server.js';
import { NextResponse } from 'next/server.js';

import { debugRouteHandlerProxy } from '../observability/debug-log';
import { analyzeRouteHandlerProxyRequestShape } from './request-shape';
import { getRouteHandlerProxyRoutingState } from './routing-state';
import {
  findMatchedRouteBasePath,
  ROUTE_HANDLER_PROXY_HEADER,
  ROUTE_HANDLER_PROXY_TARGET_HEADER
} from './shared';
import { resolveRouteHandlerProxyLazyMissWithWorker } from '../worker/client';

import type {
  RouteHandlerProxyDecision,
  RouteHandlerProxyOptions
} from './types';
import type { RouteHandlerProxyRoutingState } from './types';

/**
 * Request classification and response creation for the dev proxy path.
 *
 * @remarks
 * This module owns the per-request part of the architecture:
 * - decide pass-through vs rewrite using already-loaded routing state
 * - translate that decision into a concrete `NextResponse`
 * - normalize page requests and Pages Router data requests onto one public
 *   route identity before heavy-route logic runs
 *
 * It intentionally does not load config-heavy routing state itself. That work
 * lives in `routing-state.ts` so request logic can stay focused and readable.
 */

/**
 * Detect whether an error means the thin Proxy runtime could not safely import
 * app-owned config through Next's special Proxy bundling pipeline.
 *
 * @param error - Unknown thrown value.
 * @returns `true` when request routing should degrade to the worker-only path.
 *
 * @remarks
 * In Next 16, Proxy runs on Node but is still compiled through a special
 * bundling/runtime pipeline. Dynamic imports that are fine in ordinary Node
 * code can still be rejected there as "module as expression is too dynamic".
 *
 * The dev-only worker process exists precisely to host that config-heavy,
 * dynamic-import-friendly logic outside the Proxy module graph. So when the
 * thin Proxy fast path hits this limitation, the correct behavior is to
 * degrade to an empty in-process routing snapshot and continue through the
 * worker path instead of crashing the request.
 */
const shouldUseWorkerOnlyProxyFallback = (error: unknown): boolean => {
  const errorMessage = error instanceof Error ? error.message : String(error);

  return (
    errorMessage.includes('module as expression is too dynamic') ||
    errorMessage.includes('Cannot find module as expression is too dynamic')
  );
};

/**
 * Build the empty routing-state fallback used when the thin Proxy fast path
 * cannot load app-owned config in-process.
 *
 * @returns Conservative empty routing state.
 */
const createEmptyRouteHandlerProxyRoutingState =
  (): RouteHandlerProxyRoutingState => ({
    rewriteBySourcePath: new Map(),
    targetRouteBasePaths: [],
    hasConfiguredTargets: true,
    bootstrapGenerationToken: 'route-handler-proxy-worker-only-fallback'
  });

/**
 * Attempt to load request-time routing state in the main Proxy process.
 *
 * @param input - Routing-state load input.
 * @param input.localeConfig - Shared locale config captured by the generated
 * root Proxy file.
 * @returns Fresh routing state, or a conservative empty fallback when the main
 * Proxy process is not allowed to load app-owned config dynamically.
 */
const getRouteHandlerProxyRoutingStateWithFallback = async ({
  localeConfig,
  configRegistration
}: RouteHandlerProxyOptions): Promise<RouteHandlerProxyRoutingState> => {
  try {
    return await getRouteHandlerProxyRoutingState({
      localeConfig,
      ...(configRegistration == null ? {} : { configRegistration })
    });
  } catch (error) {
    if (!shouldUseWorkerOnlyProxyFallback(error)) {
      throw error;
    }

    debugRouteHandlerProxy('routing-state:fallback-to-worker-only', {
      message: error instanceof Error ? error.message : String(error)
    });

    return createEmptyRouteHandlerProxyRoutingState();
  }
};

/**
 * Create the final request decision for a lazily prepared heavy route.
 *
 * @param input - Heavy-route decision input.
 * @param input.pathname - Original public request pathname.
 * @param input.routeBasePaths - Known splitter target route bases for headers.
 * @param input.fallbackRouteBasePath - Target-local route base used when the
 * shared routing state does not yet have any discovered base paths.
 * @param input.rewriteDestination - Concrete generated handler destination.
 * @returns Final proxy decision for this heavy route.
 *
 * @remarks
 * This helper keeps the final request-routing result narrow and focused:
 * once a concrete heavy rewrite destination is known, the response path is
 * simply a rewrite to that generated handler page.
 */
const createRouteHandlerProxyDecisionForLazyHeavyRoute = async ({
  pathname,
  routeBasePaths,
  fallbackRouteBasePath,
  rewriteDestination
}: {
  pathname: string;
  routeBasePaths: Array<string>;
  fallbackRouteBasePath: string;
  rewriteDestination: string;
}): Promise<RouteHandlerProxyDecision> => {
  const decisionRouteBasePaths =
    routeBasePaths.length > 0 ? routeBasePaths : [fallbackRouteBasePath];

  return {
    kind: 'rewrite',
    pathname,
    routeBasePaths: decisionRouteBasePaths,
    rewriteDestination
  };
};

/**
 * Resolve the high-level routing decision for one incoming proxy request.
 *
 * @param input - Request-decision input.
 * @param input.request - Incoming Next proxy request.
 * @param input.options - Proxy runtime options captured by the generated root file.
 * @returns High-level routing decision for the request.
 *
 * @remarks
 * This is the main conditional split for the conservative dev proxy mode:
 * - known heavy routes rewrite to generated handlers
 * - lazily discovered heavy routes can now reuse a validated process-local
 *   snapshot before paying the full lazy miss path again
 * - unknown routes then continue through the isolated lazy request-resolution
 *   seam
 *
 * A cold miss can still discover and emit a heavy route on demand, but once
 * that heavy rewrite destination is known the proxy response stays simple:
 * rewrite to the generated handler page.
 */
const resolveRouteHandlerProxyDecision = async ({
  request,
  options
}: {
  request: NextRequest;
  options: RouteHandlerProxyOptions;
}): Promise<RouteHandlerProxyDecision> => {
  const requestShape = analyzeRouteHandlerProxyRequestShape(request);
  const pathname = requestShape.publicPathname;

  debugRouteHandlerProxy('request:start', {
    pathname,
    requestKind: requestShape.kind,
    rawUrl: request.url
  });

  const routingState = await getRouteHandlerProxyRoutingStateWithFallback({
    localeConfig: options.localeConfig,
    ...(options.configRegistration == null
      ? {}
      : {
          configRegistration: options.configRegistration
        })
  });
  const knownRewriteDestination =
    routingState.rewriteBySourcePath.get(pathname);

  if (knownRewriteDestination == null) {
    debugRouteHandlerProxy('routing-state:miss', {
      pathname,
      requestKind: requestShape.kind
    });

    if (!routingState.hasConfiguredTargets) {
      return {
        kind: 'pass-through',
        pathname,
        routeBasePaths: []
      };
    }

    // Cold lazy misses are now delegated to the dedicated worker boundary.
    // That keeps the main proxy bundle free of the heavy MDX-analysis graph
    // while preserving the same semantic request-routing contract.
    const lazyWorkerResult = await resolveRouteHandlerProxyLazyMissWithWorker({
      pathname,
      localeConfig: options.localeConfig,
      bootstrapGenerationToken: routingState.bootstrapGenerationToken,
      ...(options.configRegistration == null
        ? {}
        : {
            configRegistration: options.configRegistration
          })
    });

    if (lazyWorkerResult.kind === 'heavy') {
      if (lazyWorkerResult.source === 'discovery') {
        debugRouteHandlerProxy('lazy-discovery:hit', {
          pathname,
          rewriteDestination: lazyWorkerResult.rewriteDestination,
          requestKind: requestShape.kind
        });
      } else {
        debugRouteHandlerProxy('lazy-worker:heavy', {
          pathname,
          requestKind: requestShape.kind,
          source: lazyWorkerResult.source,
          rewriteDestination: lazyWorkerResult.rewriteDestination
        });
      }

      return createRouteHandlerProxyDecisionForLazyHeavyRoute({
        pathname,
        routeBasePaths: routingState.targetRouteBasePaths,
        fallbackRouteBasePath: lazyWorkerResult.routeBasePath,
        rewriteDestination: lazyWorkerResult.rewriteDestination
      });
    }

    debugRouteHandlerProxy('lazy-worker:pass-through', {
      pathname,
      requestKind: requestShape.kind,
      reason: lazyWorkerResult.reason
    });

    // Conservative fall-through: unless the existing cached/generated routing
    // state marks this exact public pathname as heavy, the proxy path leaves
    // normal app routing untouched.
    //
    // The lazy request-resolution and one-file preparation steps above now tell
    // us whether this miss corresponds to:
    // - a pathname outside all configured targets
    // - a target-owned pathname with no backing content file
    // - a target-owned pathname with one concrete backing file
    // - and, for that one file, whether it is heavy or light
    //
    // If the worker reports a non-heavy outcome, the request still falls
    // through to normal app routing.
    return {
      kind: 'pass-through',
      pathname,
      routeBasePaths: routingState.targetRouteBasePaths
    };
  }

  debugRouteHandlerProxy('routing-state:hit', {
    pathname,
    requestKind: requestShape.kind,
    rewriteDestination: knownRewriteDestination
  });

  return createRouteHandlerProxyDecisionForLazyHeavyRoute({
    pathname,
    routeBasePaths: routingState.targetRouteBasePaths,
    fallbackRouteBasePath: routingState.targetRouteBasePaths[0] ?? '/',
    rewriteDestination: knownRewriteDestination
  });
};

/**
 * Attach diagnostic proxy headers to a concrete response.
 *
 * @param input - Header-decoration input.
 * @param input.response - Response to mutate.
 * @param input.decision - Request decision being materialized.
 * @returns The same response instance for convenience.
 */
const decorateRouteHandlerProxyResponse = ({
  response,
  decision
}: {
  response: NextResponse;
  decision: Extract<
    RouteHandlerProxyDecision,
    {
      kind: 'pass-through' | 'rewrite';
    }
  >;
}): NextResponse => {
  // The mode header makes live debugging much easier because a single `curl -I`
  // immediately tells us whether the request was rewritten or merely observed.
  response.headers.set(ROUTE_HANDLER_PROXY_HEADER, decision.kind);

  const matchedRouteBasePath = findMatchedRouteBasePath({
    pathname: decision.pathname,
    routeBasePaths: decision.routeBasePaths
  });

  if (matchedRouteBasePath != null) {
    // The target header is best-effort diagnostic metadata, not a correctness
    // input. It helps us see which configured target the proxy runtime believes
    // owns the pathname without affecting the actual rewrite decision.
    response.headers.set(
      ROUTE_HANDLER_PROXY_TARGET_HEADER,
      matchedRouteBasePath
    );
  }

  return response;
};

/**
 * Translate a high-level request decision into the concrete Next response that
 * should be returned from Proxy.
 *
 * @param input - Response creation input.
 * @param input.request - Incoming Next proxy request.
 * @param input.decision - High-level routing decision for the request.
 * @returns Concrete proxy response.
 */
const createRouteHandlerProxyResponse = async ({
  request,
  decision
}: {
  request: NextRequest;
  decision: RouteHandlerProxyDecision;
}): Promise<NextResponse> => {
  const requestShape = analyzeRouteHandlerProxyRequestShape(request);

  if (decision.kind === 'pass-through') {
    debugRouteHandlerProxy('response:pass-through', {
      pathname: decision.pathname,
      requestKind: requestShape.kind
    });
    return decorateRouteHandlerProxyResponse({
      response: NextResponse.next(),
      decision
    });
  }

  // Rewrite responses always target the generated handler *page* pathname.
  // Next handles data-route translation internally when needed.
  const rewriteUrl = new URL(decision.rewriteDestination, request.url);
  rewriteUrl.search = request.nextUrl.search;

  debugRouteHandlerProxy('response:rewrite', {
    pathname: decision.pathname,
    requestKind: requestShape.kind,
    rewriteDestination: decision.rewriteDestination,
    rewriteUrl: rewriteUrl.toString()
  });

  return decorateRouteHandlerProxyResponse({
    response: NextResponse.rewrite(rewriteUrl),
    decision
  });
};

/**
 * Resolve and materialize the final proxy response for one request.
 *
 * @param input - Proxy request input.
 * @param input.request - Incoming Next proxy request.
 * @param input.options - Runtime options captured in the generated root file.
 * @returns Final `NextResponse` returned from the package-owned proxy runtime.
 */
export const handleRouteHandlerProxyRequest = async ({
  request,
  options
}: {
  request: NextRequest;
  options: RouteHandlerProxyOptions;
}): Promise<NextResponse> => {
  const decision = await resolveRouteHandlerProxyDecision({
    request,
    options
  });

  return createRouteHandlerProxyResponse({
    request,
    decision
  });
};
