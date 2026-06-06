'use client';

import { useSlugSplitterNotFoundRetry } from 'next-slug-splitter/next/app/proxy/not-found-retry';

/**
 * App routes served by the proxy rewrite system.
 */
const CATCH_ALL_ROUTE_SEGMENTS = ['docs'];

export default function NotFound() {
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
}
