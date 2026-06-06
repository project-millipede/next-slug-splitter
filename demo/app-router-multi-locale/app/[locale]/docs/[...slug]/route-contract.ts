/**
 * Route-owned docs contract for the App Router demo.
 *
 * This file is the single authored source of truth for docs route semantics:
 * - the public light catch-all page delegates to it
 * - generated heavy handler pages delegate to it
 * - there is no second authored worker-only route runtime
 *
 * The exported helpers are intentionally page-facing:
 * - `getStaticParams` enumerates all statically generated localized params
 * - `generatePageMetadata` resolves metadata for the public page and generated
 *   heavy pages
 * - `loadPageProps` loads render data for the public page and generated heavy
 *   pages
 */

import { notFound } from 'next/navigation';
import { runAppPageDataCompiler } from 'next-slug-splitter/next';

import {
  formatContentTitle,
  getStaticParams as getContentStaticParams
} from '../../../../lib/content';
import {
  resolveSupportedLocale,
  type SupportedLocale
} from '../../../../lib/locale-utils';

type DocsRouteParams = {
  locale: string;
  slug: string[];
};

const normalizeSlug = (params: Partial<DocsRouteParams> | undefined) => {
  const slug = params?.slug;

  return Array.isArray(slug) ? slug : [];
};

/**
 * Shared static-params enumerator for the public page.
 *
 * The public page still wraps this with `withHeavyRouteFilter(...)` because
 * excluding heavy routes from the light catch-all remains a page-entry concern.
 */
export const getStaticParams = getContentStaticParams;

/**
 * Page-facing metadata helper shared by the public page and generated heavy
 * handlers.
 */
export const generatePageMetadata = async (params: DocsRouteParams) => {
  const locale = resolveSupportedLocale(params.locale);
  const slug = normalizeSlug(params);

  if (slug.length === 0) {
    return {
      title: locale === 'de' ? 'Dokumentation' : 'Docs'
    };
  }

  return {
    title: formatContentTitle(slug)
  };
};

/**
 * Page-facing props helper shared by the public page and generated heavy
 * handlers.
 */
export const loadPageProps = async (params: DocsRouteParams) => {
  const locale = resolveSupportedLocale(params.locale);
  const slug = normalizeSlug(params);

  if (slug.length === 0) {
    notFound();
  }

  return await runAppPageDataCompiler<
    {
      locale: SupportedLocale;
      slug: string[];
    },
    {
      code: string;
      locale: SupportedLocale;
      slug: string[];
    }
  >({
    targetId: 'docs',
    input: {
      locale,
      slug
    }
  });
};

export const revalidate = false;
