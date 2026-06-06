import { useEffect, useRef, useState } from 'react';

import { isNotFoundRetryRoute } from '../../shared/not-found-retry-route';

const READINESS_POLL_INTERVAL_MS = 100;
const MAX_READINESS_CHECKS = 40;
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

/**
 * Wait for a bounded amount of time between readiness probes.
 *
 * @param ms - Delay duration in milliseconds.
 * @returns A promise that settles after the requested delay.
 */
const sleep = (ms: number) =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

/**
 * Poll the current route until it starts responding or the retry budget is
 * exhausted.
 *
 * 1. App Router uses a normal HTML `GET` request for this retry path.
 * 2. The probe sends `accept: text/html` so it follows the App document route.
 * 3. `no-store` avoids cached probe responses while the dev server is warming.
 * 4. Only the response status is used; the response body is not inspected.
 *
 * @param routePath - Current route path, including its query string.
 * @param shouldStop - Cancellation check used to abort polling on unmount.
 * @returns `true` when the route responds successfully before polling stops;
 * otherwise `false`.
 */
const waitForRouteReadiness = async (
  routePath: string,
  shouldStop: () => boolean
): Promise<boolean> => {
  for (let attempt = 0; attempt < MAX_READINESS_CHECKS; attempt += 1) {
    if (shouldStop()) {
      return false;
    }

    try {
      const response = await fetch(routePath, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          accept: 'text/html'
        }
      });

      if (response.ok) {
        return true;
      }
    } catch {
      // Ignore transient dev-server/network errors while the route is still
      // warming up and keep polling until the bounded attempt budget is spent.
    }

    await sleep(READINESS_POLL_INTERVAL_MS);
  }

  return false;
};

export type UseSlugSplitterNotFoundRetryOptions = {
  /**
   * Route segments served by the slug-splitter proxy rewrite system.
   *
   * Only paths matching one of these segments participate in the bounded
   * development-only readiness probe and retry.
   */
  catchAllRouteSegments: ReadonlyArray<string>;
};

/**
 * Development-only retry helper for transient proxy-owned 404s.
 *
 * 1. In dev proxy mode, a cold heavy route can hit a narrow readiness race
 *    while Next is still warming the generated handler page.
 * 2. During that window, the request can land on a transient 404 even though
 *    the route is about to become ready.
 * 3. This hook hides the not-found UI, polls the same public URL until it
 *    responds, then retries the navigation once.
 * 4. The App retry uses `window.location.replace(...)` after the App document
 *    readiness probe succeeds.
 * 5. In production builds this is a no-op. Handler pages are already compiled
 *    and the transient cold-start 404 window does not apply there.
 *
 * @param options - Retry configuration.
 * @returns `true` when the caller should render its 404 UI.
 */
export const useSlugSplitterNotFoundRetry = ({
  catchAllRouteSegments
}: UseSlugSplitterNotFoundRetryOptions): boolean => {
  const hasRetried = useRef(false);
  // Start hidden so retryable development routes do not flash a 404 before
  // the readiness probe and router-specific retry get a chance to run.
  const [showNotFound, setShowNotFound] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!IS_DEVELOPMENT) {
      setShowNotFound(true);
      return;
    }

    if (hasRetried.current) {
      return;
    }

    if (!isNotFoundRetryRoute(window.location.pathname, catchAllRouteSegments)) {
      setShowNotFound(true);
      return;
    }

    let cancelled = false;
    const retryTarget = `${window.location.pathname}${window.location.search}`;

    /**
     * Execute the bounded readiness probe and dispatch the router-specific
     * retry once the current route starts responding.
     *
     * Flow:
     * 1. The initial navigation lands on the router-specific not-found
     *    boundary: `app/not-found.tsx`.
     * 2. This helper probes the same public route until it starts responding.
     * 3. Once the route responds, the router-specific retry navigates to the
     *    original URL.
     * 4. If readiness never arrives or retry dispatch fails, the normal
     *    not-found UI is shown.
     *
     * The effect keeps the async flow inside this helper so the effect body can
     * stay synchronous and still return a normal cleanup function.
     */
    const run = async () => {
      const routeReady = await waitForRouteReadiness(
        retryTarget,
        () => cancelled
      );

      if (cancelled) {
        return;
      }

      if (!routeReady) {
        setShowNotFound(true);
        return;
      }

      hasRetried.current = true;

      try {
        window.location.replace(retryTarget);
      } catch {
        if (!cancelled) {
          setShowNotFound(true);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [catchAllRouteSegments]);

  return showNotFound;
};
