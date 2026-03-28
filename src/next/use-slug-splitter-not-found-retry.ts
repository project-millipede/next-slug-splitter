import { useEffect, useRef, useState } from 'react';

/**
 * Import `next/router.js` instead of `next/router` here.
 *
 * 1. This package ships ESM subpath exports through `dist/`.
 * 2. The built `next/not-found` entry is then loaded as an external package
 *    module during Next's build-time page-data collection.
 * 3. In that packaged ESM context, the concrete `next/router.js` file
 *    resolves more reliably than the bare `next/router` specifier.
 */
import { useRouter } from 'next/router.js';

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
 * Check whether the current pathname belongs to one of the configured
 * catch-all routes that can trigger a development-time retry.
 *
 * @param pathname - Current browser pathname.
 * @param catchAllRoutePrefixes - Configured catch-all route prefixes.
 * @returns `true` when the pathname should participate in the retry flow.
 */
const isRetryableRoute = (
  pathname: string,
  catchAllRoutePrefixes: ReadonlyArray<string>
): boolean => catchAllRoutePrefixes.some(prefix => pathname.includes(prefix));

/**
 * Poll the current route with bounded `HEAD` requests until it starts
 * responding or the retry budget is exhausted.
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
      // 1. Use `fetch` because this client-side hook only needs a small,
      //    built-in readiness probe and not a full navigation.
      // 2. Use `HEAD` to probe readiness without requesting the full page body.
      // 3. Use `no-store` so every retry checks the current dev-server state.
      // 4. Send `x-nextjs-data` so the probe follows the pages-router data path.
      const response = await fetch(routePath, {
        method: 'HEAD',
        cache: 'no-store',
        headers: {
          'x-nextjs-data': '1'
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
   * Routes served by the slug-splitter proxy rewrite system.
   *
   * Only paths matching one of these prefixes participate in the bounded
   * development-only readiness probe and retry.
   */
  catchAllRoutePrefixes: ReadonlyArray<string>;
};

/**
 * Development-only retry helper for transient proxy-owned 404s.
 *
 * 1. Routes served by the proxy rewrite system can hit a narrow
 * development-time race on first cold load in Turbopack: the proxy may
 * already know the correct rewrite target while Next is still warming the
 * emitted handler page up.
 *
 * 2. During that window, the request can still land on a transient 404 even
 * though the route is about to become ready.
 *
 * 3. Instead of showing a not-found page immediately, this hook performs a
 * single bounded readiness probe against the current route and retries once
 * only after the route starts responding. That avoids guessing with a blind
 * delay while still preventing an endless retry loop if the route never
 * becomes ready.
 *
 * 4. In production builds this is a no-op. Handler pages are already compiled
 * and rewrite ownership is already materialized, so the transient cold-start
 * 404 window does not apply there.
 *
 * 5. Non-retryable routes also render their 404 UI immediately.
 *
 * @param options - Retry configuration.
 * @returns `true` when the caller should render its 404 UI.
 */
export const useSlugSplitterNotFoundRetry = ({
  catchAllRoutePrefixes
}: UseSlugSplitterNotFoundRetryOptions): boolean => {
  const router = useRouter();
  const hasRetried = useRef(false);
  // Start hidden so retryable development routes do not flash a 404 before
  // the readiness probe and single retry get a chance to run.
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

    if (!isRetryableRoute(window.location.pathname, catchAllRoutePrefixes)) {
      setShowNotFound(true);
      return;
    }

    let cancelled = false;
    const retryTarget = `${window.location.pathname}${window.location.search}`;

    /**
     * Execute the bounded readiness probe and dispatch the single retry once
     * the current catch-all route starts responding.
     *
     * Flow:
     * 1. The initial client navigation lands on the app's 404 page during the
     *    transient handler warm-up window.
     * 2. This helper probes that same route through the pages-router data path
     *    until the route begins responding.
     * 3. Once the probe succeeds, `router.replace(...)` retries the original
     *    navigation target.
     * 4. If readiness never arrives, the hook leaves the normal 404 UI in place.
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
        const result = await router.replace(retryTarget);

        if (!cancelled && !result) {
          setShowNotFound(true);
        }
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
  }, [catchAllRoutePrefixes, router]);

  return showNotFound;
};
