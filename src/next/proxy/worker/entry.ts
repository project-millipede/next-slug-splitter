import { stdin, stdout } from 'node:process';

import { debugRouteHandlerProxyWorker } from './debug-log';
import { resolveRouteHandlerProxyLazyMiss } from './resolve-lazy-miss';

import type {
  RouteHandlerProxyWorkerRequest,
  RouteHandlerProxyWorkerResponse
} from './types';

/**
 * Parse one worker request from stdin.
 *
 * @returns Parsed JSON request.
 */
const readRouteHandlerProxyWorkerRequest = async (): Promise<RouteHandlerProxyWorkerRequest> => {
  const chunks: Array<Buffer> = [];

  for await (const chunk of stdin) {
    chunks.push(
      typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    );
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

/**
 * Write one worker response to stdout as JSON.
 *
 * @param response - Serialized worker response.
 */
const writeRouteHandlerProxyWorkerResponse = (
  response: RouteHandlerProxyWorkerResponse
): void => {
  stdout.write(JSON.stringify(response));
};

/**
 * Run one single-shot lazy proxy worker request.
 *
 * @remarks
 * This entrypoint intentionally keeps the process contract tiny:
 * - read one JSON request from stdin
 * - resolve it fully
 * - print one JSON response to stdout
 * - exit
 *
 * The worker is dev-only and only serves cold lazy misses, so simplicity is
 * more valuable here than inventing a long-lived protocol prematurely.
 */
const main = async (): Promise<void> => {
  const request = await readRouteHandlerProxyWorkerRequest();

  debugRouteHandlerProxyWorker('request:start', {
    kind: request.kind,
    pathname: request.kind === 'resolve-lazy-miss' ? request.pathname : undefined,
    cwd: process.cwd(),
    configPath: process.env.SLUG_SPLITTER_CONFIG_PATH,
    configRootDir: process.env.SLUG_SPLITTER_CONFIG_ROOT_DIR
  });

  if (request.kind !== 'resolve-lazy-miss') {
    throw new Error(
      `Unsupported next-slug-splitter proxy worker request "${request.kind}".`
    );
  }

  const response = await resolveRouteHandlerProxyLazyMiss({
    pathname: request.pathname,
    localeConfig: request.localeConfig
  });

  debugRouteHandlerProxyWorker('request:result', response);

  writeRouteHandlerProxyWorkerResponse(response);
};

void main();
