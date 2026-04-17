import {
  getWorkerHostGlobalState,
  type WorkerHostGlobalState,
  type WorkerHostProcessShutdownState,
  type WorkerHostProtocolState
} from '../../../shared/worker/host/global-state';

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
   * Long-lived worker sessions keyed by config-registration session identity.
   */
  workerSessions: Map<string, RouteHandlerProxyWorkerSession>;
};

/**
 * Shared host-side IPC protocol state.
 */
export type RouteHandlerProxyWorkerProtocolState = WorkerHostProtocolState;

/**
 * Shared process-shutdown state for graceful worker cleanup.
 */
export type RouteHandlerProxyWorkerProcessShutdownState =
  WorkerHostProcessShutdownState;

/**
 * Full process-global host state shared by every public worker host entry.
 *
 * @remarks
 * Keeping the client, protocol, and shutdown buckets together behind one
 * global accessor gives the codebase exactly one place that touches
 * `globalThis` for host-worker singleton behavior.
 */
export type RouteHandlerProxyWorkerHostGlobalState =
  WorkerHostGlobalState<RouteHandlerProxyWorkerClientState>;

/**
 * Process-global symbol key used to store the host-worker singleton state.
 *
 * @remarks
 * The symbol must stay stable across built bundles so startup instrumentation
 * and later proxy requests converge on the same process-global state object.
 */
const ROUTE_HANDLER_PROXY_WORKER_HOST_GLOBAL_STATE_KEY =
  'next-slug-splitter.route-handler-proxy-worker-host-global-state';

/**
 * Create a fresh process-global host state object.
 *
 * @returns Newly initialized host-global state.
 */
const createRouteHandlerProxyWorkerClientState =
  (): RouteHandlerProxyWorkerClientState => ({
    inFlightLazyMissResolutions: new Map(),
    workerSessions: new Map()
  });

/**
 * Read or create the process-global host-worker singleton state.
 *
 * @returns Shared host-global state for the current parent process.
 */
export const getRouteHandlerProxyWorkerHostGlobalState =
  (): RouteHandlerProxyWorkerHostGlobalState =>
    getWorkerHostGlobalState(
      ROUTE_HANDLER_PROXY_WORKER_HOST_GLOBAL_STATE_KEY,
      createRouteHandlerProxyWorkerClientState
    );
