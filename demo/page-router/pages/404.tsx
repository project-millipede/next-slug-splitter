import type { NextPage } from 'next';

import { useSlugSplitterNotFoundRetry } from 'next-slug-splitter/next/pages/proxy/not-found-retry';

/**
 * Routes served by the proxy rewrite system.
 */
const CATCH_ALL_ROUTE_SEGMENTS = ['docs'];

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
