import type { NextPage } from 'next';

import { useSlugSplitterNotFoundRetry } from 'next-slug-splitter/next/pages/proxy/not-found-retry';

/**
 * Routes served by the proxy rewrite system.
 */
const CATCH_ALL_ROUTE_SEGMENTS = ['docs'];

/**
 * Keep the Pages Router not-found boundary hidden while the rewrite retry is
 * pending, then show it once the 404 is confirmed.
 *
 * The retry hook gives the slug-splitter proxy a chance to recover pages that
 * are reachable through generated-handler rewrites before the user sees a 404.
 */
const NotFound: NextPage = () => {
  const isNotFoundConfirmed = useSlugSplitterNotFoundRetry({
    catchAllRouteSegments: CATCH_ALL_ROUTE_SEGMENTS
  });

  if (!isNotFoundConfirmed) {
    return null;
  }

  return (
    <>
      <h1>Page Not Found</h1>
    </>
  );
};

export default NotFound;
