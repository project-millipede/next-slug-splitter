import {
  bootstrapRouteHandlerProxyWorker,
  closeRouteHandlerProxyWorkerBootstrapState,
  type RouteHandlerProxyWorkerBootstrapState
} from './bootstrap';
import { debugRouteHandlerProxyWorker } from '../debug-log';
import { resolveRouteHandlerProxyLazyMiss } from './resolve-lazy-miss';

import type {
  RouteHandlerProxyWorkerRequest,
  RouteHandlerProxyWorkerResponseEnvelope
} from '../types';

/**
 * Runtime entrypoint for the dedicated proxy worker process.
 *
 * @remarks
 * This file owns the worker-process event loop:
 * - validate the IPC-capable worker runtime contract
 * - receive and dispatch bootstrap, lazy-miss, and shutdown requests
 * - hold the current bootstrap state in memory between requests
 * - emit serialized response envelopes back to the host process
 *
 * Lower-level bootstrap construction and lazy-miss semantics are delegated to
 * their dedicated runtime modules so this entrypoint can stay focused on
 * request dispatch and worker lifecycle.
 */

/**
 * Send one response envelope back to the parent process over IPC.
 *
 * @param response - Serialized worker response envelope.
 *
 * @remarks
 * Transport aspects:
 * - Channel: protocol traffic uses Node IPC instead of stdout.
 * - Separation: app-owned stdout/stderr activity remains outside the request
 *   protocol.
 * - Validation: the worker requires an IPC-capable spawn contract.
 */
const writeRouteHandlerProxyWorkerResponse = (
  response: RouteHandlerProxyWorkerResponseEnvelope
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (typeof process.send !== 'function') {
      reject(
        new Error('next-slug-splitter proxy worker requires an IPC channel.')
      );
      return;
    }

    process.send(response, error => {
      if (error != null) {
        reject(error);
        return;
      }

      resolve();
    });
  });

/**
 * Replace the current worker bootstrap state with a newly bootstrapped
 * generation, closing the old generation first when present.
 *
 * @param getBootstrapState - Accessor for the current worker bootstrap state.
 * @param setBootstrapState - Updater for the current worker bootstrap state.
 * @param nextBootstrapState - Newly bootstrapped state for the active
 * generation.
 * @returns `void` after any previous bootstrap state has been closed and the
 * new state has been installed.
 */
const replaceRouteHandlerProxyWorkerBootstrapState = ({
  getBootstrapState,
  setBootstrapState,
  nextBootstrapState
}: {
  getBootstrapState: () => RouteHandlerProxyWorkerBootstrapState | null;
  setBootstrapState: (
    nextBootstrapState: RouteHandlerProxyWorkerBootstrapState | null
  ) => void;
  nextBootstrapState: RouteHandlerProxyWorkerBootstrapState;
}): void => {
  const existingBootstrapState = getBootstrapState();

  if (existingBootstrapState != null) {
    closeRouteHandlerProxyWorkerBootstrapState(existingBootstrapState);
  }

  setBootstrapState(nextBootstrapState);
};

/**
 * Close the currently installed worker bootstrap state when one exists.
 *
 * @param getBootstrapState - Accessor for the current worker bootstrap state.
 * @param setBootstrapState - Updater for the current worker bootstrap state.
 * @returns `void` after the current bootstrap state has been closed and
 * cleared.
 */
const clearRouteHandlerProxyWorkerBootstrapState = ({
  getBootstrapState,
  setBootstrapState
}: {
  getBootstrapState: () => RouteHandlerProxyWorkerBootstrapState | null;
  setBootstrapState: (
    nextBootstrapState: RouteHandlerProxyWorkerBootstrapState | null
  ) => void;
}): void => {
  const existingBootstrapState = getBootstrapState();

  if (existingBootstrapState == null) {
    return;
  }

  closeRouteHandlerProxyWorkerBootstrapState(existingBootstrapState);
  setBootstrapState(null);
};

/**
 * Handle one request on the long-lived worker session.
 *
 * @param input - Session request input.
 * @param input.request - Parsed worker request.
 * @param input.getBootstrapState - Current session bootstrap-state accessor.
 * @param input.setBootstrapState - Session bootstrap-state updater.
 * @returns `void` after the request has been fully handled.
 *
 * @remarks
 * Request-handling aspects:
 * - Bootstrap requests replace the current derived worker state for the active
 *   generation.
 * - Lazy-miss requests are rejected until bootstrap has completed.
 * - Each request is answered independently over IPC with either a success or
 *   error envelope.
 */
const handleRouteHandlerProxyWorkerRequest = async ({
  request,
  getBootstrapState,
  setBootstrapState
}: {
  request: RouteHandlerProxyWorkerRequest;
  getBootstrapState: () => RouteHandlerProxyWorkerBootstrapState | null;
  setBootstrapState: (
    nextBootstrapState: RouteHandlerProxyWorkerBootstrapState | null
  ) => void;
}): Promise<void> => {
  try {
    if (request.kind === 'bootstrap') {
      const nextBootstrapState = await bootstrapRouteHandlerProxyWorker(
        request.bootstrapGenerationToken,
        request.localeConfig,
        request.configRegistration
      );

      replaceRouteHandlerProxyWorkerBootstrapState({
        getBootstrapState,
        setBootstrapState,
        nextBootstrapState
      });
      await writeRouteHandlerProxyWorkerResponse({
        requestId: request.requestId,
        ok: true,
        response: {
          kind: 'bootstrapped',
          bootstrapGenerationToken: nextBootstrapState.bootstrapGenerationToken
        }
      });
      return;
    }

    if (request.kind === 'shutdown') {
      debugRouteHandlerProxyWorker('shutdown:received', {
        hasBootstrapState: getBootstrapState() != null
      });
      clearRouteHandlerProxyWorkerBootstrapState({
        getBootstrapState,
        setBootstrapState
      });
      await writeRouteHandlerProxyWorkerResponse({
        requestId: request.requestId,
        ok: true,
        response: {
          kind: 'shutdown-complete'
        }
      });

      process.disconnect?.();
      process.exit(0);
      return;
    }

    const bootstrapState = getBootstrapState();

    if (bootstrapState == null) {
      throw new Error(
        'next-slug-splitter proxy worker must be bootstrapped before resolving lazy misses.'
      );
    }

    const response = await resolveRouteHandlerProxyLazyMiss(
      request.pathname,
      bootstrapState
    );

    debugRouteHandlerProxyWorker('request:result', response);

    await writeRouteHandlerProxyWorkerResponse({
      requestId: request.requestId,
      ok: true,
      response
    });
  } catch (error) {
    try {
      await writeRouteHandlerProxyWorkerResponse({
        requestId: request.requestId,
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error)
        }
      });
    } catch {
      // If the IPC channel is already unavailable there is no narrower
      // recovery path left for this request.
    }
  }
};

/**
 * Run the persistent worker session.
 *
 * @remarks
 * Session aspects:
 * - Lifecycle: the process stays alive and handles many requests.
 * - State: bootstrap state is held in memory between requests.
 * - Input validation: non-object IPC payloads are ignored rather than treated
 *   as protocol failures.
 */
const main = async (): Promise<void> => {
  let bootstrapState: RouteHandlerProxyWorkerBootstrapState | null = null;

  if (typeof process.send !== 'function') {
    throw new Error('next-slug-splitter proxy worker requires an IPC channel.');
  }

  process.on('message', rawMessage => {
    if (rawMessage == null || typeof rawMessage !== 'object') {
      return;
    }

    const request = rawMessage as RouteHandlerProxyWorkerRequest;

    debugRouteHandlerProxyWorker('request:start', {
      kind: request.kind,
      requestId: request.requestId,
      pathname:
        request.kind === 'resolve-lazy-miss' ? request.pathname : undefined,
      cwd: process.cwd(),
      configPath: process.env.SLUG_SPLITTER_CONFIG_PATH,
      configRootDir: process.env.SLUG_SPLITTER_CONFIG_ROOT_DIR
    });

    void handleRouteHandlerProxyWorkerRequest({
      request,
      getBootstrapState: () => bootstrapState,
      setBootstrapState: nextBootstrapState => {
        bootstrapState = nextBootstrapState;
      }
    });
  });
};

void main();
