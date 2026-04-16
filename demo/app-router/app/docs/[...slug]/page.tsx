/**
 * Catch-all docs route — `app/docs/[...slug]/page.tsx`
 *
 * This is the public light page for the docs route.
 *
 * Ownership reasoning:
 * - the route folder now owns the full authored behavior surface
 * - both this page and generated heavy handlers delegate to
 *   `./route-contract`
 * - `withHeavyRouteFilter(...)` still stays here because excluding heavy
 *   routes from the light catch-all is a page-entry concern
 */

import { withHeavyRouteFilter } from 'next-slug-splitter/next/lookup';

import { createHandlerPage } from '../../../lib/handler-factory/runtime';
import {
  generatePageMetadata,
  getStaticParams,
  loadPageProps
} from './route-contract';

type DocsRouteParams = {
  slug: string[];
};

/**
 * Created with an empty `loadableRegistrySubset` — no heavy components
 * are registered, so the client bundle stays small.
 */
const DocsPage = createHandlerPage({
  loadableRegistrySubset: {}
});

export const dynamicParams = false;

/**
 * Enumerates all content slugs, then filters out any that are already
 * served by a dedicated heavy handler page. Without `withHeavyRouteFilter`,
 * Next.js would generate duplicate routes for the heavy pages.
 */
export const generateStaticParams = withHeavyRouteFilter({
  targetId: 'docs',
  generateStaticParams: getStaticParams
});

export async function generateMetadata({
  params
}: {
  params: Promise<DocsRouteParams>;
}) {
  // Next currently types App Router page params as a Promise in this demo.
  const resolvedParams = await params;
  return generatePageMetadata(resolvedParams);
}

export default async function Page({
  params
}: {
  params: Promise<DocsRouteParams>;
}) {
  // The route contract expects the plain params object, not the Promise wrapper.
  const resolvedParams = await params;
  const props = await loadPageProps(resolvedParams);

  return <DocsPage {...props} />;
}
