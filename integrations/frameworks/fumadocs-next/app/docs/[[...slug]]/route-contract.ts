import type { Metadata } from 'next';
import type { MDXContent } from 'mdx/types';
import { notFound } from 'next/navigation';

import { source } from '../../../lib/source';

export type DocsRouteParams = {
  slug?: string[];
};

type PageDataWithBody = {
  body: MDXContent;
};

type AsyncPageData = {
  load: () => Promise<PageDataWithBody>;
};

type FumadocsPageData = PageDataWithBody | AsyncPageData;

const loadPageData = async (
  data: FumadocsPageData
): Promise<PageDataWithBody> => ('load' in data ? data.load() : data);

const normalizeSlug = (params: DocsRouteParams): string[] =>
  Array.isArray(params.slug) ? params.slug : [];

const getPageOrNotFound = (params: DocsRouteParams) => {
  const page = source.getPage(normalizeSlug(params));

  if (page == null) {
    notFound();
  }

  return page;
};

export const getStaticParams = () => source.generateParams();

export const generatePageMetadata = async (
  params: DocsRouteParams
): Promise<Metadata> => {
  const page = getPageOrNotFound(params);

  return {
    title: page.data.title,
    description: page.data.description
  };
};

export const loadPageProps = async (params: DocsRouteParams) => {
  const page = getPageOrNotFound(params);
  const loadedData = await loadPageData(page.data);

  return {
    page: {
      ...page,
      data: {
        ...page.data,
        ...loadedData
      }
    },
    MDX: loadedData.body,
    params: {
      slug: normalizeSlug(params)
    }
  };
};

export const revalidate = false;
