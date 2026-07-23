/**
 * Append a unique query parameter to defeat browser and proxy caches.
 *
 * @param url - Browser-visible URL to cache-bust.
 * @param runId - Unique measurement run identifier.
 * @returns URL with a `measureRun` query parameter.
 */
export const appendCacheBuster = (url: string, runId: string): string => {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}measureRun=${encodeURIComponent(runId)}`;
};

/**
 * Create a unique id for one route measurement run.
 *
 * @returns Random run id used for cache-busting related requests.
 */
export const createRunId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
