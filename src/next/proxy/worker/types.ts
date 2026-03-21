import type { LocaleConfig } from '../../../core/types';

/**
 * Serialized request sent from the thin proxy runtime into the dev-only lazy
 * worker process.
 *
 * @remarks
 * The worker boundary exists specifically so the main proxy bundle can remain
 * free of the MDX analysis stack. That means the wire contract should stay
 * intentionally small and JSON-serializable.
 */
export type RouteHandlerProxyWorkerRequest = {
  kind: 'resolve-lazy-miss';
  pathname: string;
  localeConfig: LocaleConfig;
};

/**
 * Serialized worker response for one proxy lazy-miss resolution.
 *
 * @remarks
 * The proxy runtime does not need the full internal lazy-analysis object
 * graph. It only needs to know whether the miss resolved to:
 * - a heavy rewrite candidate
 * - or a conservative pass-through
 *
 * Returning just that semantic outcome keeps the worker boundary clean and
 * avoids leaking lazy implementation details back into the thin proxy path.
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
