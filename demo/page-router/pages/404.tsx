import type { NextPage } from 'next';

import { useSlugSplitterNotFoundRetry } from 'next-slug-splitter/next/not-found-retry';

/**
 * Routes served by the proxy rewrite system.
 */
const CATCH_ALL_ROUTE_PREFIXES = ['/docs/', '/blog/'];

const NotFound: NextPage = () => {
  const isNotFoundConfirmed = useSlugSplitterNotFoundRetry({
    catchAllRoutePrefixes: CATCH_ALL_ROUTE_PREFIXES
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
