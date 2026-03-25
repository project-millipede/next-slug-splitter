import type { NextPage } from 'next';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

/**
 * Routes served by the proxy rewrite system. On first cold load in dev
 * (Turbopack), the handler page may not be compiled yet when the proxy
 * rewrites to it, producing a transient 404. Instead of showing an error
 * page we auto-retry once after a readiness probe confirms that the route's
 * data endpoint is responding. This avoids guessing with a blind delay while
 * still preventing an endless retry loop if the route never becomes ready.
 *
 * In production builds this never triggers because all handler pages are
 * pre-compiled and the rewrite cache is pre-generated.
 */
const RETRY_ROUTE_PREFIXES = ['/docs/', '/blog/'];
const READINESS_POLL_INTERVAL_MS = 100;
const MAX_READINESS_CHECKS = 40;

const isRetryableRoute = (pathname: string): boolean =>
  RETRY_ROUTE_PREFIXES.some(prefix => pathname.includes(prefix));

const sleep = (ms: number) =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

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

const NotFound: NextPage = () => {
  const router = useRouter();
  const hasRetried = useRef(false);

  // Start as null (undecided) — avoids SSR rendering "Page Not Found" for
  // retryable routes where router.asPath isn't the real path during SSR.
  const [showNotFound, setShowNotFound] = useState<boolean>(false);

  useEffect(() => {
    if (hasRetried.current) {
      return;
    }

    if (!isRetryableRoute(window.location.pathname)) {
      setShowNotFound(true);
      return;
    }

    let cancelled = false;
    const retryTarget = `${window.location.pathname}${window.location.search}`;

    void (async () => {
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

      // Mark the retry as consumed only once the readiness probe succeeds and
      // the client retry is actually dispatched. If React remounts this page
      // before then, the next mount can continue waiting instead of losing the
      // only retry attempt.
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
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!showNotFound) {
    return null;
  }

  return (
    <>
      <h1>Page Not Found</h1>
    </>
  );
};

export default NotFound;
