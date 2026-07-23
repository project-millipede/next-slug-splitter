import { NextResponse, type NextRequest } from 'next/server.js';

import { buildAppDefaultLocaleNormalizationProxyDecision } from '../../app/proxy/default-locale-normalization';
import { preservePagesRouterLocaleInProxyRewriteDestination } from '../../pages/proxy/rewrite-transport';
import {
  isGeneratedHandlerSourcePath,
  ROUTE_HANDLER_PUBLIC_GUARD_DESTINATION
} from '../../shared/rewrites/guards';
import { resolveRouteHandlerProxyRewriteResponseDecision } from '../rewrite-readiness';
import { debugRouteHandlerProxy } from '../observability/debug-log';
import {
  analyzeRouteHandlerProxyRequestShape,
  type RouteHandlerProxyRequestShape
} from './request-shape';
import { getRouteHandlerProxyRoutingState } from './routing-state';
import {
  findMatchedRouteBasePath,
  ROUTE_HANDLER_PROXY_HEADER,
  ROUTE_HANDLER_PROXY_TARGET_HEADER
} from './shared';
import { resolveRouteHandlerProxyLazyMissWithWorker } from '../worker/host/client';

import type { LocaleConfig } from '../../../core/types';
import type { RouteHandlerRouterKind } from '../../shared/types';
import type {
  RouteHandlerProxyDecision,
  RouteHandlerProxyConfigRegistration,
  RouteHandlerProxyOptions,
  RouteHandlerProxyRoutingState
} from './types';

type RewriteDecision = Extract<RouteHandlerProxyDecision, { kind: 'rewrite' }>;

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
    handlerGuardTargets: [],
    hasConfiguredTargets: true,
    bootstrapGenerationToken: 'route-handler-proxy-worker-only-fallback'
  });

/**
 * Attempt to load request-time routing state in the main Proxy process.
 *
 * @param localeConfig - Shared locale config captured by the generated root
 * Proxy file.
 * @param configRegistration - Adapter-time config registration.
 * @returns Fresh routing state, or a conservative empty fallback when the main
 * Proxy process is not allowed to load app-owned config dynamically.
 */
const getRouteHandlerProxyRoutingStateWithFallback = async (
  localeConfig: LocaleConfig,
  configRegistration: RouteHandlerProxyConfigRegistration
): Promise<RouteHandlerProxyRoutingState> => {
  try {
    return await getRouteHandlerProxyRoutingState(
      localeConfig,
      configRegistration
    );
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
 * @remarks
 * This helper keeps the final request-routing result narrow and focused:
 * once a concrete heavy rewrite destination is known, the response path is
 * simply a rewrite to that generated handler page.
 *
 * @param pathname - Original public request pathname.
 * @param routeBasePaths - Known splitter target route bases for headers.
 * @param fallbackRouteBasePath - Target-local route base used when the shared
 * routing state does not yet have any discovered base paths.
 * @param rewriteDestination - Concrete generated handler destination.
 * @param heavyRouteRouterKind - Optional router family owning the generated
 * handler.
 * @param heavyRouteLocale - Optional locale resolved for the matched heavy
 * route.
 * @returns Final proxy decision for this heavy route.
 */
const createRouteHandlerProxyDecisionForLazyHeavyRoute = (
  pathname: string,
  routeBasePaths: Array<string>,
  fallbackRouteBasePath: string,
  rewriteDestination: string,
  heavyRouteRouterKind?: RouteHandlerRouterKind,
  heavyRouteLocale?: string
): RewriteDecision => {
  const decisionRouteBasePaths =
    routeBasePaths.length > 0 ? routeBasePaths : [fallbackRouteBasePath];

  const rewriteDecision: RewriteDecision = {
    kind: 'rewrite',
    pathname,
    routeBasePaths: decisionRouteBasePaths,
    rewriteDestination
  };

  /*
   * Pages Router dev-proxy locale protocol, step 1:
   * 1. The router-kind check happens while the heavy rewrite decision is
   *    created.
   * 2. Pages Router rewrites store the resolved request locale as response
   *    metadata.
   * 3. App Router rewrites do not store this metadata because generated handler
   *    params already carry the locale.
   */
  if (heavyRouteRouterKind === 'pages' && heavyRouteLocale != null) {
    rewriteDecision.pagesRouterRewriteLocalePrefix = heavyRouteLocale;
  }

  return rewriteDecision;
};

/**
 * Check whether one rewrite decision carries a Pages Router locale prefix.
 *
 * Pages Router dev-proxy locale protocol, step 2:
 * 1. The router-kind decision already happened when the rewrite decision was
 *    created.
 * 2. This response step only checks whether that earlier decision stored
 *    `pagesRouterRewriteLocalePrefix`.
 * 3. Pages Router heavy rewrite decisions carry
 *    `pagesRouterRewriteLocalePrefix`.
 * 4. App Router rewrite decisions do not carry this field because generated
 *    handler params carry the locale.
 * 5. This predicate only narrows the optional string metadata.
 *
 * @param decision - Final rewrite decision.
 * @returns `true` when the rewrite decision carries a Pages Router rewrite
 * locale prefix.
 */
const hasPagesRouterRewriteLocalePrefix = (
  decision: RewriteDecision
): decision is RewriteDecision & {
  pagesRouterRewriteLocalePrefix: string;
} => decision.pagesRouterRewriteLocalePrefix != null;

/**
 * Resolve the internal destination used for one proxy rewrite response.
 *
 * 1. Most rewrite decisions use `rewriteDestination` unchanged.
 * 2. Pages Router heavy rewrites may carry `pagesRouterRewriteLocalePrefix`
 *    because `NextResponse.rewrite(...)` needs the public locale as the first
 *    destination segment in dev mode.
 * 3. The Pages transport helper owns the actual destination transformation.
 *
 * @example
 * // Ordinary rewrite decision
 * rewriteDestination: '/en/docs/a' -> '/en/docs/a'
 *
 * // Pages Router generated-handler rewrite decision
 * rewriteDestination: '/docs/generated-handlers/a/de'
 * pagesRouterRewriteLocalePrefix: 'de'
 * -> '/de/docs/generated-handlers/a/de'
 *
 * @param decision - Final rewrite decision.
 * @param localeConfig - Locale semantics captured by the generated proxy.
 * @returns Internal destination path for `NextResponse.rewrite(...)`.
 */
const resolveRouteHandlerProxyRewriteDestination = (
  decision: RewriteDecision,
  localeConfig: LocaleConfig
): string => {
  if (hasPagesRouterRewriteLocalePrefix(decision)) {
    return preservePagesRouterLocaleInProxyRewriteDestination(
      decision.rewriteDestination,
      decision.pagesRouterRewriteLocalePrefix,
      localeConfig
    );
  }

  return decision.rewriteDestination;
};

/**
 * Create the URL passed to `NextResponse.rewrite(...)`.
 *
 * 1. Pages Router lazy destinations remain locale-less during planning.
 * 2. App destinations retain the shape required by their generated-output
 *    placement.
 * 3. Pages Router lazy destinations receive the resolved request locale only
 *    at this proxy transport boundary.
 * 4. Single-locale internal sentinels are never prefixed.
 *
 * @param request - Incoming proxy request.
 * @param localeConfig - Locale semantics captured by the generated proxy.
 * @param decision - Final rewrite decision.
 * @returns Absolute rewrite URL with the original query string preserved.
 */
const createRouteHandlerProxyRewriteUrl = (
  request: NextRequest,
  localeConfig: LocaleConfig,
  decision: RewriteDecision
): URL => {
  const rewriteDestination = resolveRouteHandlerProxyRewriteDestination(
    decision,
    localeConfig
  );
  const rewriteUrl = new URL(rewriteDestination, request.url);
  rewriteUrl.search = request.nextUrl.search;

  return rewriteUrl;
};

/**
 * Create the guard decision for direct generated-handler source paths.
 *
 * 1. The input pathname is the browser-visible rewrite source path.
 * 2. Matching happens before cached rewrite lookup and worker classification.
 * 3. Internal generated-handler rewrite destinations are unaffected because
 *    this guard only checks the original request pathname.
 *
 * @param pathname - Browser-visible request pathname.
 * @param localeConfig - Locale semantics captured by the proxy bridge.
 * @param routingState - Request-time proxy routing state.
 * @returns Rewrite decision to `/404`, or `null` when the pathname is allowed.
 */
const createGeneratedHandlerGuardDecision = (
  pathname: string,
  localeConfig: LocaleConfig,
  routingState: RouteHandlerProxyRoutingState
): Extract<RouteHandlerProxyDecision, { kind: 'rewrite' }> | null => {
  const shouldGuardGeneratedHandlerSourcePath = isGeneratedHandlerSourcePath(
    pathname,
    localeConfig,
    routingState.handlerGuardTargets
  );

  if (shouldGuardGeneratedHandlerSourcePath) {
    return {
      kind: 'rewrite',
      pathname,
      routeBasePaths: routingState.targetRouteBasePaths,
      rewriteDestination: ROUTE_HANDLER_PUBLIC_GUARD_DESTINATION
    };
  }

  return null;
};

/**
 * Resolve the route decision plus the one raw response-side fact needed by the
 * updated-handler redirect safeguard.
 *
 * @remarks
 * This is the main conditional split for the conservative dev proxy mode:
 * - known heavy routes rewrite to generated handlers
 * - lazily discovered heavy routes can now reuse a validated process-local
 *   snapshot before paying the full lazy miss path again
 * - unknown routes then continue through the isolated lazy request-resolution
 *   seam
 *
 * A cold miss can still discover and emit a heavy route on demand. When that
 * happens, route resolution still stays close to `main`: it returns the pure
 * route decision plus one raw fact that the later response path can use for
 * the updated-handler safeguard.
 *
 * The response layer then decides whether an updated generated handler should
 * pay one temporary refresh boundary before the browser enters that route.
 *
 * @param request - Incoming Next proxy request.
 * @param requestShape - Normalized proxy request shape reused across route
 * resolution and response materialization.
 * @param options - Proxy runtime options captured by the generated root file.
 * @returns Route decision plus the updated-handler rewrite fact needed for
 * response postprocessing.
 */
const resolveRouteHandlerProxyResponseInput = async (
  request: NextRequest,
  requestShape: RouteHandlerProxyRequestShape,
  { localeConfig, configRegistration = {} }: RouteHandlerProxyOptions
): Promise<{
  decision: RouteHandlerProxyDecision;
  updatedHandlerWasRewritten: boolean;
}> => {
  const pathname = requestShape.publicPathname;

  debugRouteHandlerProxy('request:start', {
    pathname,
    requestKind: requestShape.kind,
    rawUrl: request.url
  });

  const routingState = await getRouteHandlerProxyRoutingStateWithFallback(
    localeConfig,
    configRegistration
  );

  const generatedHandlerGuardDecision = createGeneratedHandlerGuardDecision(
    pathname,
    localeConfig,
    routingState
  );

  if (generatedHandlerGuardDecision != null) {
    debugRouteHandlerProxy('public-guard:generated-handler', {
      pathname,
      requestKind: requestShape.kind,
      rewriteDestination: generatedHandlerGuardDecision.rewriteDestination
    });

    return {
      decision: generatedHandlerGuardDecision,
      updatedHandlerWasRewritten: false
    };
  }

  const knownRewriteDestination =
    routingState.rewriteBySourcePath.get(pathname);

  if (knownRewriteDestination == null) {
    debugRouteHandlerProxy('routing-state:miss', {
      pathname,
      requestKind: requestShape.kind
    });

    if (!routingState.hasConfiguredTargets) {
      return {
        decision: {
          kind: 'pass-through',
          pathname,
          routeBasePaths: []
        },
        updatedHandlerWasRewritten: false
      };
    }

    // Cold lazy misses are now delegated to the dedicated worker boundary.
    // That keeps the main proxy bundle free of the heavy MDX-analysis graph
    // while preserving the same semantic request-routing contract.
    const lazyWorkerResult = await resolveRouteHandlerProxyLazyMissWithWorker({
      pathname,
      localeConfig,
      bootstrapGenerationToken: routingState.bootstrapGenerationToken,
      configRegistration
    });

    if (lazyWorkerResult.subject === 'heavy') {
      debugRouteHandlerProxy('lazy-worker:heavy', {
        pathname,
        requestKind: requestShape.kind,
        handlerSynchronizationStatus:
          lazyWorkerResult.payload.handlerSynchronizationStatus,
        rewriteDestination: lazyWorkerResult.payload.rewriteDestination
      });

      const updatedHandlerWasRewritten =
        lazyWorkerResult.payload.handlerSynchronizationStatus === 'updated';

      const rewriteDecision = createRouteHandlerProxyDecisionForLazyHeavyRoute(
        pathname,
        routingState.targetRouteBasePaths,
        lazyWorkerResult.payload.routeBasePath,
        lazyWorkerResult.payload.rewriteDestination,
        lazyWorkerResult.payload.routerKind,
        lazyWorkerResult.payload.locale
      );

      return {
        decision: rewriteDecision,
        updatedHandlerWasRewritten
      };
    }

    debugRouteHandlerProxy('lazy-worker:pass-through', {
      pathname,
      requestKind: requestShape.kind,
      reason: lazyWorkerResult.payload.reason
    });

    const normalizationDecision =
      buildAppDefaultLocaleNormalizationProxyDecision({
        pathname,
        routeBasePaths: routingState.targetRouteBasePaths,
        localeConfig,
        payload: lazyWorkerResult.payload
      });

    if (normalizationDecision != null) {
      debugRouteHandlerProxy('lazy-worker:app-locale-normalization', {
        pathname,
        requestKind: requestShape.kind,
        rewriteDestination: normalizationDecision.rewriteDestination
      });

      return {
        decision: normalizationDecision,
        updatedHandlerWasRewritten: false
      };
    }

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
      decision: {
        kind: 'pass-through',
        pathname,
        routeBasePaths: routingState.targetRouteBasePaths
      },
      updatedHandlerWasRewritten: false
    };
  }

  debugRouteHandlerProxy('routing-state:hit', {
    pathname,
    requestKind: requestShape.kind,
    rewriteDestination: knownRewriteDestination
  });

  return {
    decision: createRouteHandlerProxyDecisionForLazyHeavyRoute(
      pathname,
      routingState.targetRouteBasePaths,
      routingState.targetRouteBasePaths[0] ?? '/',
      knownRewriteDestination
    ),
    updatedHandlerWasRewritten: false
  };
};

/**
 * Attach diagnostic proxy headers to a concrete response.
 *
 * @param response - Response to mutate.
 * @param decision - Request decision being materialized.
 * @returns The same response instance for convenience.
 */
const decorateRouteHandlerProxyResponse = (
  response: NextResponse,
  decision: RouteHandlerProxyDecision
): NextResponse => {
  // The mode header makes live debugging much easier because a single `curl -I`
  // immediately tells us whether the request was rewritten or merely observed.
  response.headers.set(ROUTE_HANDLER_PROXY_HEADER, decision.kind);

  const matchedRouteBasePath = findMatchedRouteBasePath(
    decision.pathname,
    decision.routeBasePaths
  );

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
 * Translate the resolved proxy decision into the concrete Next response that
 * Proxy should return for this request.
 *
 * Response flow:
 * 1. The route decision first passes through the updated-handler redirect
 *    safeguard. Most decisions materialize unchanged, but a rewrite for a
 *    just-updated generated handler may become one temporary self-redirect on
 *    the primary HTML navigation request.
 * 2. `pass-through` materializes as `NextResponse.next()`.
 * 3. `redirect` materializes as `NextResponse.redirect(...)` back to the same
 *    public pathname. This is the conservative dev-only refresh boundary used
 *    before the browser enters a just-updated generated handler route.
 * 4. `rewrite` materializes as `NextResponse.rewrite(...)` to the resolved
 *    internal route pathname.
 *
 * @param request - Incoming Next proxy request.
 * @param requestShape - Normalized proxy request shape.
 * @param decision - Route decision to materialize.
 * @param updatedHandlerWasRewritten - Whether lazy heavy preparation
 * overwrote an existing emitted handler file during this request.
 * @returns Concrete proxy response.
 */
const createRouteHandlerProxyResponse = async (
  request: NextRequest,
  requestShape: RouteHandlerProxyRequestShape,
  localeConfig: LocaleConfig,
  decision: RouteHandlerProxyDecision,
  updatedHandlerWasRewritten: boolean
): Promise<NextResponse> => {
  // 1. First apply the updated-handler redirect safeguard.
  const responseDecision = resolveRouteHandlerProxyRewriteResponseDecision(
    request,
    requestShape,
    decision,
    updatedHandlerWasRewritten
  );

  // 2. Pass-through stays on ordinary Next routing.
  if (responseDecision.kind === 'pass-through') {
    debugRouteHandlerProxy('response:pass-through', {
      pathname: responseDecision.pathname,
      requestKind: requestShape.kind
    });
    return decorateRouteHandlerProxyResponse(
      NextResponse.next(),
      responseDecision
    );
  }

  // 3. Redirect pays one temporary refresh boundary on the same public URL
  // before the browser enters a just-updated generated handler route.
  if (responseDecision.kind === 'redirect') {
    const redirectUrl = new URL(
      responseDecision.redirectDestination,
      request.url
    );
    redirectUrl.search = request.nextUrl.search;

    debugRouteHandlerProxy('response:redirect', {
      pathname: responseDecision.pathname,
      requestKind: requestShape.kind,
      redirectDestination: responseDecision.redirectDestination,
      redirectUrl: redirectUrl.toString()
    });

    return decorateRouteHandlerProxyResponse(
      NextResponse.redirect(redirectUrl),
      responseDecision
    );
  }

  // 4. Rewrite enters either a generated heavy handler or an App physical
  // locale route. Next handles data-route translation internally when needed.
  const rewriteUrl = createRouteHandlerProxyRewriteUrl(
    request,
    localeConfig,
    responseDecision
  );

  debugRouteHandlerProxy('response:rewrite', {
    pathname: responseDecision.pathname,
    requestKind: requestShape.kind,
    rewriteDestination: responseDecision.rewriteDestination,
    rewriteUrl: rewriteUrl.toString()
  });

  return decorateRouteHandlerProxyResponse(
    NextResponse.rewrite(rewriteUrl),
    responseDecision
  );
};

/**
 * Resolve and materialize the final proxy response for one request.
 *
 * @remarks
 * Final orchestration happens in three steps:
 * 1. Classify the incoming request once into a reusable `requestShape`.
 * 2. Resolve the route decision plus the updated-handler rewrite fact.
 * 3. Materialize the final `NextResponse` from that shared request context.
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
  const requestShape = analyzeRouteHandlerProxyRequestShape(request);

  const { decision, updatedHandlerWasRewritten } =
    await resolveRouteHandlerProxyResponseInput(request, requestShape, options);

  return createRouteHandlerProxyResponse(
    request,
    requestShape,
    options.localeConfig,
    decision,
    updatedHandlerWasRewritten
  );
};
