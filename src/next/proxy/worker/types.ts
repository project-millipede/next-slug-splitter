import type { LocaleConfig } from '../../../core/types';
import type { BootstrapGenerationToken } from '../runtime/types';

/**
 * Serialized request sent from the thin proxy runtime into the dev-only lazy
 * worker session.
 *
 * @remarks
 * Design aspects:
 * - Transport: requests stay JSON-serializable so they can travel over Node
 *   IPC without custom encoding.
 * - Boundary: the thin proxy runtime forwards only the data required to
 *   classify or bootstrap one request.
 * - Isolation: heavy planning state remains worker-local instead of being
 *   reconstructed in the proxy runtime.
 */
export type RouteHandlerProxyWorkerRequest =
  | {
      requestId: string;
      kind: 'bootstrap';
      bootstrapGenerationToken: BootstrapGenerationToken;
      localeConfig: LocaleConfig;
    }
  | {
      requestId: string;
      kind: 'resolve-lazy-miss';
      pathname: string;
    };

/**
 * Acknowledgement returned when the long-lived worker session has finished its
 * one-time bootstrap work for the current generation.
 */
export type RouteHandlerProxyWorkerBootstrapResponse = {
  kind: 'bootstrapped';
  bootstrapGenerationToken: BootstrapGenerationToken;
};

/**
 * Serialized worker response for one proxy lazy-miss resolution.
 *
 * @remarks
 * Design aspects:
 * - Scope: the proxy runtime only receives the semantic routing outcome.
 * - Stability: internal analysis objects stay inside the worker and do not
 *   become part of the wire contract.
 * - Evolution: keeping the response small reduces coupling between the thin
 *   runtime and the worker implementation.
 */
export type RouteHandlerProxyWorkerResponse =
  | {
      kind: 'heavy';
      source: 'discovery' | 'fresh' | 'cache';
      rewriteDestination: string;
      routeBasePath: string;
    }
  | {
      kind: 'pass-through';
      reason:
        | 'no-target'
        | 'missing-route-file'
        | 'light'
        | 'missing-rewrite-destination';
    };

/**
 * One IPC response envelope traveling from the worker back to the thin proxy
 * runtime.
 *
 * @remarks
 * Design aspects:
 * - Multiplexing: request ids let one long-lived worker serve multiple
 *   overlapping requests.
 * - Symmetry: both bootstrap and lazy-miss responses use the same outer
 *   envelope shape.
 * - Failure reporting: worker-side errors stay request-scoped instead of
 *   collapsing the entire session immediately.
 */
export type RouteHandlerProxyWorkerResponseEnvelope =
  | {
      requestId: string;
      ok: true;
      response:
        | RouteHandlerProxyWorkerBootstrapResponse
        | RouteHandlerProxyWorkerResponse;
    }
  | {
      requestId: string;
      ok: false;
      error: {
        message: string;
      };
    };
