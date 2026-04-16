import { debugRouteHandlerProxy } from '../../observability/debug-log';
import {
  createSharedWorkerRequestId,
  resetSharedWorkerProtocolState
} from '../../../shared/worker/host/protocol';
import { getRouteHandlerProxyWorkerHostGlobalState } from './global-state';
import { sendRouteHandlerProxyWorkerRequest } from './protocol';
import { installRouteHandlerProxyWorkerProcessShutdownHooks } from './process-shutdown';
import {
  resolveRouteHandlerProxyWorkerSession,
  shutdownRouteHandlerProxyWorkerSessionGracefully,
  type RouteHandlerProxyWorkerSession
} from './session-lifecycle';

import type { LocaleConfig } from '../../../../core/types';
import type {
  BootstrapGenerationToken,
  RouteHandlerProxyConfigRegistration
} from '../../runtime/types';
import type {
  RouteHandlerProxyWorkerResolveLazyMissRequest,
  RouteHandlerProxyWorkerResponse,
} from '../types';

/**
 * Host-side client for the dedicated proxy worker process.
 *
 * @remarks
 * This module is the thin public composition root for the host-side worker
 * client:
 * - own the persistent host maps for live worker sessions and in-flight
 *   lazy-miss dedupe
 * - install process-shutdown hooks on first worker use
 * - expose the public lazy-miss, startup-prewarm, and explicit-clear APIs
 *
 * Lower-level IPC transport and worker process lifecycle are intentionally
 * delegated to `protocol.ts` and `session-lifecycle.ts`.
 */
const routeHandlerProxyWorkerClientState =
  getRouteHandlerProxyWorkerHostGlobalState().client;
const routeHandlerProxyWorkerProtocolState =
  getRouteHandlerProxyWorkerHostGlobalState().protocol;

/**
 * Host-side in-flight dedupe for lazy worker requests.
 *
 * @remarks
 * This map intentionally tracks request-level overlap, not worker-session
 * ownership:
 * - scope: one promise per identical lazy-miss input
 * - purpose: collapse overlapping host requests onto one worker request
 * - lifetime: cleared when the request promise settles or when client state is
 *   explicitly reset
 *
 * See `docs/architecture/cache-policy.md`.
 */
const inFlightLazyMissResolutions =
  routeHandlerProxyWorkerClientState.inFlightLazyMissResolutions;

/**
 * Host-side registry of long-lived worker sessions.
 *
 * @remarks
 * This map intentionally tracks process/session ownership, not request dedupe:
 * - scope: one persistent worker session per config registration
 * - purpose: keep warm worker state alive across revisits while the bootstrap
 *   generation remains unchanged
 * - lifecycle: sessions are reused, gracefully replaced on generation change,
 *   and fully cleared during explicit client shutdown
 *
 * See `docs/architecture/cache-policy.md`.
 */
const workerSessions = routeHandlerProxyWorkerClientState.workerSessions;

/**
 * Clear all persistent worker client state.
 *
 * @remarks
 * Cleanup aspects:
 * - Tests use this to isolate worker-session state.
 * - Explicit refresh work can reuse the same teardown path later.
 * - Every known session is closed through the normal lifecycle helper.
 *
 * @returns `void` after every known worker session has been shut down and all
 * client-side worker bookkeeping has been cleared.
 */
export const clearRouteHandlerProxyWorkerClientSessions = async (): Promise<void> => {
  const activeWorkerSessions = [...workerSessions.values()];

  for (const workerSession of activeWorkerSessions) {
    await shutdownRouteHandlerProxyWorkerSessionGracefully({
      workerSessions,
      session: workerSession,
      reason: 'client-clear'
    });
  }

  workerSessions.clear();
  inFlightLazyMissResolutions.clear();
  resetSharedWorkerProtocolState(routeHandlerProxyWorkerProtocolState);
};

/**
 * Ensure the current long-lived worker session is bootstrapped and ready.
 *
 * @param input - Worker-session input.
 * @param input.localeConfig - Locale config captured by the generated root bridge.
 * @param input.bootstrapGenerationToken - Current bootstrap generation token.
 * @param input.configRegistration - Optional adapter-time config registration.
 * @returns Ready worker session for the current generation.
 */
export const resolveRouteHandlerProxyWorkerClientSession = async ({
  localeConfig,
  bootstrapGenerationToken,
  configRegistration = {}
}: {
  localeConfig: LocaleConfig;
  bootstrapGenerationToken: BootstrapGenerationToken;
  configRegistration?: RouteHandlerProxyConfigRegistration;
}): Promise<RouteHandlerProxyWorkerSession> => {
  installRouteHandlerProxyWorkerProcessShutdownHooks({
    getActiveSessionCount: () => workerSessions.size,
    clearWorkerSessions: clearRouteHandlerProxyWorkerClientSessions
  });

  return await resolveRouteHandlerProxyWorkerSession({
    workerSessions,
    localeConfig,
    bootstrapGenerationToken,
    configRegistration
  });
};

/**
 * Resolve one proxy lazy miss through the dedicated persistent worker session.
 *
 * @remarks
 * This client keeps only in-flight dedupe in the parent process. Warm reuse
 * now comes from keeping the worker session itself alive across revisits while
 * the bootstrap generation remains unchanged.
 *
 * @param input - Worker client input.
 * @param input.pathname - Public pathname that missed the stable routing state.
 * @param input.localeConfig - Locale config captured by the generated root proxy.
 * @param input.bootstrapGenerationToken - Current bootstrap generation token from the parent runtime.
 * @param input.configRegistration - Optional adapter-time config registration
 * forwarded by the generated root proxy.
 * @returns Semantic lazy-miss outcome.
 */
export const resolveRouteHandlerProxyLazyMissWithWorker = async ({
  pathname,
  localeConfig,
  bootstrapGenerationToken,
  configRegistration = {}
}: {
  pathname: string;
  localeConfig: LocaleConfig;
  bootstrapGenerationToken: BootstrapGenerationToken;
  configRegistration?: RouteHandlerProxyConfigRegistration;
}): Promise<RouteHandlerProxyWorkerResponse> => {
  const dedupeKey = JSON.stringify([
    pathname,
    localeConfig,
    bootstrapGenerationToken,
    configRegistration.configPath ?? null,
    configRegistration.rootDir ?? null
  ]);
  const existingResolution = inFlightLazyMissResolutions.get(dedupeKey);

  if (existingResolution != null) {
    return existingResolution;
  }

  const routedResolutionPromise = resolveRouteHandlerProxyWorkerClientSession({
    localeConfig,
    bootstrapGenerationToken,
    configRegistration
  })
    .then(session => {
      const request: RouteHandlerProxyWorkerResolveLazyMissRequest = {
          requestId: createSharedWorkerRequestId(
            routeHandlerProxyWorkerProtocolState,
            'route-handler-proxy-worker-request'
          ),
          subject: 'resolve-lazy-miss',
          payload: {
            pathname
          }
        };

      return sendRouteHandlerProxyWorkerRequest(session, request);
    })
    .catch(error => {
      debugRouteHandlerProxy('lazy-worker:error', {
        pathname,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    })
    .finally(() => {
      inFlightLazyMissResolutions.delete(dedupeKey);
    });

  inFlightLazyMissResolutions.set(dedupeKey, routedResolutionPromise);
  return routedResolutionPromise;
};
