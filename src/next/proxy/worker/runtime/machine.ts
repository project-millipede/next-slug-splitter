import {
  bootstrapRouteHandlerProxyWorker,
  closeRouteHandlerProxyWorkerBootstrapState,
  type RouteHandlerProxyWorkerBootstrapState
} from './bootstrap';
import { resolveRouteHandlerProxyLazyMiss } from './resolve-lazy-miss';
import { debugRouteHandlerProxyWorker } from '../debug-log';
import { createWorkerRuntimeMachine } from '../../../shared/worker/runtime/machine';

import type {
  RouteHandlerProxyWorkerBootstrapResponse,
  RouteHandlerProxyWorkerRequest,
  RouteHandlerProxyWorkerResponse
} from '../types';

/**
 * Retained proxy-worker state stored inside the shared runtime machine.
 */
export type RouteHandlerProxyWorkerExtensionState = {
  /**
   * Current bootstrapped planner state for the active generation.
   */
  bootstrapState: RouteHandlerProxyWorkerBootstrapState | null;
};

/**
 * Replace the current worker bootstrap state with a newly bootstrapped
 * generation, closing the old generation first when present.
 *
 * @param extensionState Current retained proxy-worker state.
 * @param nextBootstrapState Newly bootstrapped state for the active generation.
 * @returns Next retained proxy-worker state.
 */
const replaceRouteHandlerProxyWorkerBootstrapState = ({
  extensionState,
  nextBootstrapState
}: {
  extensionState: RouteHandlerProxyWorkerExtensionState;
  nextBootstrapState: RouteHandlerProxyWorkerBootstrapState;
}): RouteHandlerProxyWorkerExtensionState => {
  if (extensionState.bootstrapState != null) {
    closeRouteHandlerProxyWorkerBootstrapState(extensionState.bootstrapState);
  }

  return {
    bootstrapState: nextBootstrapState
  };
};

/**
 * Close the currently installed worker bootstrap state when one exists.
 *
 * @param extensionState Current retained proxy-worker state.
 * @returns Next retained proxy-worker state with no installed bootstrap state.
 */
const clearRouteHandlerProxyWorkerBootstrapState = ({
  extensionState
}: {
  extensionState: RouteHandlerProxyWorkerExtensionState;
}): RouteHandlerProxyWorkerExtensionState => {
  if (extensionState.bootstrapState != null) {
    closeRouteHandlerProxyWorkerBootstrapState(extensionState.bootstrapState);
  }

  return {
    bootstrapState: null
  };
};

/**
 * Create the shared runtime machine for the dedicated proxy worker process.
 *
 * @returns Shared runtime machine for one proxy worker process.
 */
export const createRouteHandlerProxyWorkerRuntimeMachine = () =>
  createWorkerRuntimeMachine<
    RouteHandlerProxyWorkerRequest,
    RouteHandlerProxyWorkerBootstrapResponse | RouteHandlerProxyWorkerResponse,
    RouteHandlerProxyWorkerExtensionState
  >({
    workerLabel: 'proxy worker',
    initialExtensionState: {
      bootstrapState: null
    },
    handlers: {
      bootstrap: async ({ action, state }) => {
        const nextBootstrapState = await bootstrapRouteHandlerProxyWorker(
          action.payload.bootstrapGenerationToken,
          action.payload.localeConfig,
          action.payload.configRegistration
        );

        return {
          response: {
            subject: 'bootstrapped',
            payload: {
              bootstrapGenerationToken:
                nextBootstrapState.bootstrapGenerationToken
            }
          },
          nextExtensionState: replaceRouteHandlerProxyWorkerBootstrapState({
            extensionState: state,
            nextBootstrapState
          })
        };
      },
      'resolve-lazy-miss': async ({ action, state }) => {
        if (state.bootstrapState == null) {
          throw new Error(
            'next-slug-splitter proxy worker must be bootstrapped before resolving lazy misses.'
          );
        }

        const response = await resolveRouteHandlerProxyLazyMiss(
          action.payload.pathname,
          state.bootstrapState
        );

        debugRouteHandlerProxyWorker('request:result', response);

        return {
          response
        };
      }
    },
    onShutdown: async ({ extensionState }) => {
      debugRouteHandlerProxyWorker('shutdown:received', {
        hasBootstrapState: extensionState.bootstrapState != null
      });

      return clearRouteHandlerProxyWorkerBootstrapState({
        extensionState
      });
    }
  });
