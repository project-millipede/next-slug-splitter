import {
  bootstrapRouteHandlerProxyWorker,
  type RouteHandlerProxyWorkerBootstrapState
} from './bootstrap';
import { debugRouteHandlerProxyWorker } from './debug-log';
import { resolveRouteHandlerProxyLazyMiss } from './resolve-lazy-miss';

import type {
  RouteHandlerProxyWorkerRequest,
  RouteHandlerProxyWorkerResponseEnvelope
} from './types';

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
): void => {
  if (typeof process.send !== 'function') {
    throw new Error(
      'next-slug-splitter proxy worker requires an IPC channel.'
    );
  }

  process.send(response);
};

/**
 * Handle one request on the long-lived worker session.
 *
 * @param input - Session request input.
 * @param input.request - Parsed worker request.
 * @param input.getBootstrapState - Current session bootstrap-state accessor.
 * @param input.setBootstrapState - Session bootstrap-state updater.
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
    nextBootstrapState: RouteHandlerProxyWorkerBootstrapState
  ) => void;
}): Promise<void> => {
  try {
    if (request.kind === 'bootstrap') {
      const bootstrapState = await bootstrapRouteHandlerProxyWorker(
        request.bootstrapGenerationToken,
        request.localeConfig
      );

      setBootstrapState(bootstrapState);
      writeRouteHandlerProxyWorkerResponse({
        requestId: request.requestId,
        ok: true,
        response: {
          kind: 'bootstrapped',
          bootstrapGenerationToken: bootstrapState.bootstrapGenerationToken
        }
      });
      return;
    }

    const bootstrapState = getBootstrapState();

    if (bootstrapState == null) {
      throw new Error(
        'next-slug-splitter proxy worker must be bootstrapped before resolving lazy misses.'
      );
    }

    const response = await resolveRouteHandlerProxyLazyMiss({
      pathname: request.pathname,
      bootstrapState
    });

    debugRouteHandlerProxyWorker('request:result', response);

    writeRouteHandlerProxyWorkerResponse({
      requestId: request.requestId,
      ok: true,
      response
    });
  } catch (error) {
    writeRouteHandlerProxyWorkerResponse({
      requestId: request.requestId,
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error)
      }
    });
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
    throw new Error(
      'next-slug-splitter proxy worker requires an IPC channel.'
    );
  }

  process.on('message', rawMessage => {
    if (rawMessage == null || typeof rawMessage !== 'object') {
      return;
    }

    const request = rawMessage as RouteHandlerProxyWorkerRequest;

    debugRouteHandlerProxyWorker('request:start', {
      kind: request.kind,
      requestId: request.requestId,
      pathname: request.kind === 'resolve-lazy-miss' ? request.pathname : undefined,
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
