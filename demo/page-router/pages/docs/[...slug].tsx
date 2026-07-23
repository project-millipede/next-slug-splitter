/**
 * Catch-all docs route — `pages/docs/[...slug].tsx`
 *
 * This is the "light" page: it renders content that does not require any
 * custom React components. Heavy pages (those that import components like
 * ExamplePreview, FlowComposer, etc.) are served by auto-generated handlers under
 * `generated-handlers/` instead, keeping this page's client bundle minimal.
 */

import type { GetStaticPaths, GetStaticProps } from 'next';
import { withHeavyRouteFilter } from 'next-slug-splitter/next/lookup';

import { createHandlerPage } from '../../lib/handler-factory/runtime';
import { getAllContentSlugs, compileContentForSlug } from '../../lib/content';
import {
  resolveSupportedLocale,
  type SupportedLocale
} from '../../lib/locale-utils';

/**
 * Props passed to the authored light docs page and generated heavy handlers.
 */
type DocsPageProps = {
  /** Compiled MDX code produced during static generation. */
  code: string;
  /** Locale resolved from Next.js Pages Router i18n routing. */
  locale: SupportedLocale;
  /** Docs route slug segments, excluding the locale filename. */
  slug: string[];
};

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
 *
 * @param ctx - Next.js static-props context for one localized docs route.
 * @returns Static props for the MDX page, or `notFound` for invalid params.
 */
export const getStaticProps: GetStaticProps<DocsPageProps> = async ctx => {
  const slug = ctx.params?.slug;

  if (!Array.isArray(slug)) {
    return { notFound: true };
  }

  const locale = resolveSupportedLocale(ctx.locale);
  const code = await compileContentForSlug(locale, slug);

  return {
    props: { code, locale, slug }
  };
};

/**
 * Enumerates all content slugs, then filters out any that are already
 * served by a dedicated heavy handler page. Without `withHeavyRouteFilter`,
 * Next.js would generate duplicate routes for the heavy pages.
 *
 * @returns Static paths for light routes that remain on the authored page.
 */
export const getStaticPaths: GetStaticPaths = withHeavyRouteFilter({
  targetId: 'docs',
  getStaticPaths: async () => {
    const paths = await getAllContentSlugs();
    return { paths, fallback: false };
  }
});

export default DocsPage;
