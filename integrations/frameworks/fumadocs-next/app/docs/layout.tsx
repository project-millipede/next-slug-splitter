import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';

import { baseLayoutOptions } from '../../lib/layout.shared';
import { source } from '../../lib/source';

const docsSidebarOptions = {
  /**
   * Disable production sidebar prefetch for this integration fixture.
   *
   * Framework defaults:
   * 1. Fumadocs delegates an omitted `prefetch` value to the active framework.
   * 2. In Next.js App Router, an omitted value means the framework
   *    default/auto prefetch behavior, not `false`.
   *
   * Production consequence:
   * 1. Visible sidebar links can prefetch sibling docs routes after hydration or
   *    idle time.
   * 2. Those prefetches can download route-specific chunks for pages the user
   *    has not opened.
   *
   * Benchmark reason:
   * 1. Sibling prefetch would make unrelated route chunks appear in browser
   *    measurements.
   * 2. That is a navigation prefetch policy consequence, not a bundler result
   *    and not splitter behavior.
   * 3. The demo opts out so route-size measurements stay focused on the
   *    currently loaded page.
   */
  prefetch: false
};

/**
 * Render the real Fumadocs docs shell with its generated page tree around the
 * splitter demo route.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      sidebar={docsSidebarOptions}
      {...baseLayoutOptions}
    >
      {children}
    </DocsLayout>
  );
}
