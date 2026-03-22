/**
 * Catch-all docs route — `pages/docs/[...slug].tsx`
 *
 * This is the "light" page: it renders content that does not require any
 * custom React components. Heavy pages (those that import components like
 * Counter, Chart, etc.) are served by auto-generated handlers under
 * `_handlers/` instead, keeping this page's client bundle minimal.
 */

import type { GetStaticProps } from 'next';
import { withHeavyRouteFilter } from 'next-slug-splitter/next/lookup';

import { createHandlerPage } from '../../lib/handler-factory/none';
import { getAllContentSlugs, compileContentForSlug } from '../../lib/content';
import { routeHandlersConfig } from '../../route-handlers-config.mjs';

/**
 * Created with an empty `loadableRegistrySubset` — no heavy components
 * are registered, so the client bundle stays small.
 */
const DocsPage = createHandlerPage({
  loadableRegistrySubset: {}
});

/**
 * Extracts the slug segments from the route params and compiles the
 * corresponding MDX content at build time. The compiled code and slug
 * are passed as props to the page component.
 */
export const getStaticProps: GetStaticProps = async ctx => {
  const slug = ctx.params?.slug;

  if (!Array.isArray(slug)) {
    return { notFound: true };
  }

  const code = await compileContentForSlug(slug);

  return {
    props: { code, slug }
  };
};

/**
 * Enumerates all content slugs, then filters out any that are already
 * served by a dedicated heavy handler page. Without `withHeavyRouteFilter`,
 * Next.js would generate duplicate routes for the heavy pages.
 */
export const getStaticPaths = withHeavyRouteFilter({
  targetId: 'docs',
  routeHandlersConfig,
  getStaticPaths: async () => {
    const paths = await getAllContentSlugs();
    return { paths, fallback: false };
  }
});

export default DocsPage;
