import { stderr } from 'node:process';

const ROUTE_HANDLER_PROXY_DEBUG_ENV_VAR = 'NEXT_SLUG_SPLITTER_DEBUG_PROXY';

const isRouteHandlerProxyWorkerDebugEnabled = (): boolean => {
  const envValue = process.env[ROUTE_HANDLER_PROXY_DEBUG_ENV_VAR];

  return (
    envValue === '1' ||
    envValue === 'true' ||
    envValue === 'yes' ||
    envValue === 'on'
  );
};

const stringifyRouteHandlerProxyWorkerDebugPayload = (
  value: unknown
): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/**
 * Emit one structured worker-side debug line to stderr.
 *
 * @param event - Short worker event label.
 * @param payload - Optional structured payload.
 *
 * @remarks
 * Logging aspects:
 * - Protocol separation: worker request/response traffic travels over IPC.
 * - Output choice: debug lines still go to stderr for visual separation.
 * - Compatibility: app-owned stdout noise no longer shares a channel with the
 *   worker protocol.
 */
export const debugRouteHandlerProxyWorker = (
  event: string,
  payload?: Record<string, unknown>
): void => {
  if (!isRouteHandlerProxyWorkerDebugEnabled()) {
    return;
  }

  const timestamp = new Date().toISOString();
  const serializedPayload =
    payload == null ? '' : ` ${stringifyRouteHandlerProxyWorkerDebugPayload(payload)}`;

  stderr.write(
    `[next-slug-splitter proxy worker][${timestamp}] ${event}${serializedPayload}\n`
  );
};
