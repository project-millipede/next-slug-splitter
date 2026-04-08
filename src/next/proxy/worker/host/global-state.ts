import type { RouteHandlerProxyWorkerResponse } from '../types';
import type { RouteHandlerProxyWorkerSession } from './session-lifecycle';

/**
 * Shared host-client state for live worker sessions and request-level dedupe.
 *
 * @remarks
 * This bucket contains the process-wide RAM state that must survive across
 * both public host entry bundles:
 * - `next/proxy`
 * - `next/instrumentation`
 *
 * The state stays scoped to one parent Node process. It is not persisted
 * across dev restarts.
 */
export type RouteHandlerProxyWorkerClientState = {
  /**
   * In-flight lazy-miss resolutions keyed by semantic request identity.
   */
  inFlightLazyMissResolutions: Map<
    string,
    Promise<RouteHandlerProxyWorkerResponse>
  >;
  /**
   * In-flight worker-session readiness resolutions keyed by generation input.
   */
  inFlightWorkerSessionResolutions: Map<
    string,
    Promise<RouteHandlerProxyWorkerSession>
  >;
  /**
   * Long-lived worker sessions keyed by config-registration session identity.
   */
  workerSessions: Map<string, RouteHandlerProxyWorkerSession>;
};

/**
 * Shared host-side IPC protocol state.
 *
 * @remarks
 * This state currently tracks only the monotonic request-id sequence used to
 * correlate IPC requests and responses for the long-lived worker session.
 */
export type RouteHandlerProxyWorkerProtocolState = {
  /**
   * Monotonic host-side request id sequence.
   */
  requestSequence: number;
};

/**
 * Shared process-shutdown state for graceful worker cleanup.
 *
 * @remarks
 * Startup instrumentation and later proxy requests can both install shutdown
 * hooks. This bucket keeps that installation idempotent and ensures repeated
 * shutdown signals collapse onto one in-flight cleanup promise.
 */
export type RouteHandlerProxyWorkerProcessShutdownState = {
  /**
   * Whether the relevant process signal handlers have already been installed.
   */
  hasInstalledHooks: boolean;
  /**
   * In-flight graceful shutdown promise, when one shutdown sequence is already
   * running.
   */
  shutdownPromise: Promise<void> | null;
};

/**
 * Full process-global host state shared by every public worker host entry.
 *
 * @remarks
 * Keeping the client, protocol, and shutdown buckets together behind one
 * global accessor gives the codebase exactly one place that touches
 * `globalThis` for host-worker singleton behavior.
 */
export type RouteHandlerProxyWorkerHostGlobalState = {
  /**
   * Host-client state for sessions and request dedupe.
   */
  client: RouteHandlerProxyWorkerClientState;
  /**
   * Host-side IPC protocol state.
   */
  protocol: RouteHandlerProxyWorkerProtocolState;
  /**
   * Process-shutdown state for graceful cleanup.
   */
  processShutdown: RouteHandlerProxyWorkerProcessShutdownState;
};

/**
 * Process-global symbol key used to store the host-worker singleton state.
 *
 * @remarks
 * The symbol must stay stable across built bundles so startup instrumentation
 * and later proxy requests converge on the same process-global state object.
 */
const ROUTE_HANDLER_PROXY_WORKER_HOST_GLOBAL_STATE_KEY = Symbol.for(
  'next-slug-splitter.route-handler-proxy-worker-host-global-state'
);

/**
 * Augmented global object shape that may already hold the shared host state.
 */
type RouteHandlerProxyWorkerHostGlobal = typeof globalThis & {
  [ROUTE_HANDLER_PROXY_WORKER_HOST_GLOBAL_STATE_KEY]?: RouteHandlerProxyWorkerHostGlobalState;
};

/**
 * Create a fresh process-global host state object.
 *
 * @returns Newly initialized host-global state.
 */
const createRouteHandlerProxyWorkerHostGlobalState =
  (): RouteHandlerProxyWorkerHostGlobalState => ({
    client: {
      inFlightLazyMissResolutions: new Map(),
      inFlightWorkerSessionResolutions: new Map(),
      workerSessions: new Map()
    },
    protocol: {
      requestSequence: 0
    },
    processShutdown: {
      hasInstalledHooks: false,
      shutdownPromise: null
    }
  });

/**
 * Read or create the process-global host-worker singleton state.
 *
 * @returns Shared host-global state for the current parent process.
 */
export const getRouteHandlerProxyWorkerHostGlobalState =
  (): RouteHandlerProxyWorkerHostGlobalState => {
    const globalWorkerHost = globalThis as RouteHandlerProxyWorkerHostGlobal;
    const existingState =
      globalWorkerHost[ROUTE_HANDLER_PROXY_WORKER_HOST_GLOBAL_STATE_KEY];

    if (existingState != null) {
      return existingState;
    }

    const createdState = createRouteHandlerProxyWorkerHostGlobalState();

    globalWorkerHost[ROUTE_HANDLER_PROXY_WORKER_HOST_GLOBAL_STATE_KEY] =
      createdState;

    return createdState;
  };
