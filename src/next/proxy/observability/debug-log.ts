/**
 * Structured debug logging for the dev proxy path.
 *
 * @remarks
 * The proxy runtime now has several subtle route-local states:
 * - public page request vs `/_next/data/...json` request
 * - shared-cache rewrite vs lazy snapshot rewrite vs cold lazy path
 *
 * When something goes wrong in development, we need a way to see *which*
 * branch the request actually took without turning normal dev output into a
 * wall of logs. This helper centralizes that instrumentation behind one flag.
 */

const ROUTE_HANDLER_PROXY_DEBUG_ENV_VAR = 'NEXT_SLUG_SPLITTER_DEBUG_PROXY';

/**
 * Whether proxy debug logging is enabled for the current process.
 *
 * @returns `true` when structured proxy logging should be emitted.
 */
const isRouteHandlerProxyDebugLoggingEnabled = (): boolean => {
  const envValue = process.env[ROUTE_HANDLER_PROXY_DEBUG_ENV_VAR];

  return (
    envValue === '1' ||
    envValue === 'true' ||
    envValue === 'yes' ||
    envValue === 'on'
  );
};

/**
 * Convert a debug payload into a stable JSON string.
 *
 * @param value - Payload value to stringify.
 * @returns Stable string representation.
 */
const stringifyRouteHandlerProxyDebugPayload = (
  value: unknown
): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/**
 * Emit one structured dev-proxy debug log entry.
 *
 * @param event - Short event label.
 * @param payload - Optional structured payload.
 */
export const debugRouteHandlerProxy = (
  event: string,
  payload?: Record<string, unknown>
): void => {
  if (!isRouteHandlerProxyDebugLoggingEnabled()) {
    return;
  }

  const timestamp = new Date().toISOString();
  const serializedPayload =
    payload == null ? '' : ` ${stringifyRouteHandlerProxyDebugPayload(payload)}`;

  console.info(
    `[next-slug-splitter proxy][${timestamp}] ${event}${serializedPayload}`
  );
};
