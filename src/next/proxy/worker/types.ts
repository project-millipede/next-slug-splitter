import type { LocaleConfig } from '../../../core/types';
import type { RouteHandlerOutputSynchronizationStatus } from '../../../generator/shared/protocol/output-lifecycle';
import type {
  WorkerRequestAction,
  WorkerResponseAction,
  WorkerResponseEnvelope,
  WorkerShutdownRequest,
  WorkerShutdownResponse
} from '../../shared/worker/types';
import type {
  BootstrapGenerationToken,
  RouteHandlerProxyConfigRegistration
} from '../runtime/types';

/**
 * Shared input required to create or resolve one persistent worker session.
 *
 * @remarks
 * This shape captures the full parent-side session identity:
 * - `localeConfig` defines the locale semantics the worker must bootstrap with
 * - `bootstrapGenerationToken` ties the session to one parent bootstrap cycle
 * - `configRegistration` scopes the session to one registered app/config root
 */
export type RouteHandlerProxyWorkerSessionInput = {
  /**
   * Locale semantics for the current worker generation.
   */
  localeConfig: LocaleConfig;
  /**
   * Parent-issued bootstrap generation token.
   */
  bootstrapGenerationToken: BootstrapGenerationToken;
  /**
   * Adapter-time config registration forwarded by the generated root proxy.
   */
  configRegistration: RouteHandlerProxyConfigRegistration;
};

/**
 * Payload for one proxy-worker bootstrap request.
 */
type RouteHandlerProxyWorkerBootstrapRequestPayload = {
  /**
   * Parent-issued generation token expected to match the persisted worker
   * bootstrap manifest on disk.
   */
  bootstrapGenerationToken: BootstrapGenerationToken;
  /**
   * Locale semantics expected to match the current persisted bootstrap
   * manifest before the worker accepts it.
   */
  localeConfig: LocaleConfig;
  /**
   * Clear adapter-owned registration values used to reload runtime
   * attachments inside the worker for this bootstrap generation.
   *
   * The worker still loads runtime attachments itself; this request only
   * carries the root/config identity needed to do that reload.
   */
  configRegistration: RouteHandlerProxyConfigRegistration;
};

/**
 * Bootstrap request action for the dev-only proxy worker.
 */
export type RouteHandlerProxyWorkerBootstrapRequest = WorkerRequestAction<
  'bootstrap',
  RouteHandlerProxyWorkerBootstrapRequestPayload
>;

/**
 * Payload for one proxy-worker lazy-miss request.
 */
type RouteHandlerProxyWorkerResolveLazyMissPayload = {
  /**
   * Public request pathname to classify against the bootstrapped targets.
   */
  pathname: string;
};

/**
 * Lazy request-classification request for one public pathname.
 *
 * @remarks
 * This reuses worker-local bootstrap state prepared by an earlier
 * `bootstrap` request so the host proxy can ask for one cold lazy miss to be
 * classified without importing the heavy MDX-analysis graph into the main
 * proxy runtime.
 */
export type RouteHandlerProxyWorkerResolveLazyMissRequest = WorkerRequestAction<
  'resolve-lazy-miss',
  RouteHandlerProxyWorkerResolveLazyMissPayload
>;

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
  | RouteHandlerProxyWorkerBootstrapRequest
  | RouteHandlerProxyWorkerResolveLazyMissRequest
  | WorkerShutdownRequest;

/**
 * Payload returned when the worker has finished bootstrapping one generation.
 */
type RouteHandlerProxyWorkerBootstrappedPayload = {
  /**
   * Active bootstrap generation token now installed in the worker.
   */
  bootstrapGenerationToken: BootstrapGenerationToken;
};

/**
 * Acknowledgement returned when the long-lived worker session has finished its
 * one-time bootstrap work for the current generation.
 */
export type RouteHandlerProxyWorkerBootstrapResponse = WorkerResponseAction<
  'bootstrapped',
  RouteHandlerProxyWorkerBootstrappedPayload
>;

/**
 * Acknowledgement returned when the worker has flushed retained caches and is
 * ready to terminate.
 */
export type RouteHandlerProxyWorkerShutdownResponse = WorkerShutdownResponse;

/**
 * Payload returned when a lazy miss resolves to a heavy route handler.
 */
type RouteHandlerProxyWorkerHeavyPayload = {
  /**
   * Filesystem synchronization result for the emitted heavy handler file.
   *
   * Synchronization aspects:
   * 1. `unchanged` means the emitted handler file already matched the freshly
   *    prepared source.
   * 2. `created` means no emitted handler file existed before this request.
   * 3. `updated` means an existing emitted handler file was overwritten with
   *    new source during this request.
   *
   * The proxy runtime treats `updated` more conservatively than `created` or
   * `unchanged`, because a just-overwritten handler path may need one more
   * request boundary before it is safe to rewrite into.
   */
  handlerSynchronizationStatus: RouteHandlerOutputSynchronizationStatus;
  /**
   * Internal rewrite destination for the emitted heavy handler.
   */
  rewriteDestination: string;
  /**
   * Public route base path owning the matched heavy route.
   */
  routeBasePath: string;
};

/**
 * Response action for a heavy lazy-miss resolution.
 */
export type RouteHandlerProxyWorkerHeavyResponse = WorkerResponseAction<
  'heavy',
  RouteHandlerProxyWorkerHeavyPayload
>;

/**
 * Payload returned when the proxy worker passes one request through.
 */
type RouteHandlerProxyWorkerPassThroughPayload = {
  /**
   * Semantic reason why the worker did not rewrite into a heavy handler.
   */
  reason:
    | 'no-target'
    | 'missing-route-file'
    | 'light'
    | 'missing-rewrite-destination';
};

/**
 * Response action for a pass-through lazy-miss resolution.
 */
export type RouteHandlerProxyWorkerPassThroughResponse = WorkerResponseAction<
  'pass-through',
  RouteHandlerProxyWorkerPassThroughPayload
>;

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
  | RouteHandlerProxyWorkerHeavyResponse
  | RouteHandlerProxyWorkerPassThroughResponse;

/**
 * Request/response pair carried by the proxy worker protocol.
 */
export type RouteHandlerProxyWorkerExchange =
  | {
      /**
       * Request variant sent to the worker.
       */
      request: RouteHandlerProxyWorkerBootstrapRequest;
      /**
       * Successful response paired with the request variant.
       */
      response: RouteHandlerProxyWorkerBootstrapResponse;
    }
  | {
      /**
       * Request variant sent to the worker.
       */
      request: RouteHandlerProxyWorkerResolveLazyMissRequest;
      /**
       * Successful response paired with the request variant.
       */
      response: RouteHandlerProxyWorkerResponse;
    }
  | {
      /**
       * Request variant sent to the worker.
       */
      request: WorkerShutdownRequest;
      /**
       * Successful response paired with the request variant.
       */
      response: RouteHandlerProxyWorkerShutdownResponse;
    };

/**
 * Successful response type paired with one proxy worker request.
 *
 * @template TRequest Concrete proxy worker request variant.
 */
export type RouteHandlerProxyWorkerExchangeResponse<
  TRequest extends RouteHandlerProxyWorkerExchange['request']
> = Extract<RouteHandlerProxyWorkerExchange, { request: TRequest }>['response'];

/**
 * One IPC response envelope traveling from the worker back to the thin proxy
 * runtime.
 */
export type RouteHandlerProxyWorkerResponseEnvelope = WorkerResponseEnvelope<
  | RouteHandlerProxyWorkerBootstrapResponse
  | RouteHandlerProxyWorkerShutdownResponse
  | RouteHandlerProxyWorkerResponse
>;
