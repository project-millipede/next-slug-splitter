import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  ComponentWorkbench,
  ExamplePreview,
  FlowComposer
} from '@next-slug-splitter/ballast-kit';
import { notFound } from 'next/navigation';

import { createPage } from '../../../../lib/handler-factory/runtime';
import { runtimeTraits } from '../../../../lib/handler-factory/runtime-traits';
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

type DocsPageProps = {
  code: string;
  locale: SupportedLocale;
  slug: string[];
};

type PageDataArtifact = {
  routes: Record<string, DocsPageProps>;
};

let pageDataArtifactPromise: Promise<PageDataArtifact> | null = null;

const pageDataPath = path.join(
  process.cwd(),
  '.benchmark',
  'page-data',
  'docs.json'
);

const toPageDataKey = (locale: SupportedLocale, slug: string[]): string =>
  `${locale}:${slug.join('/')}`;

const readPageDataArtifact = async (): Promise<PageDataArtifact> => {
  pageDataArtifactPromise ??= readFile(pageDataPath, 'utf8').then(
    text => JSON.parse(text) as PageDataArtifact
  );

  return pageDataArtifactPromise;
};

/**
 * Heavy baseline docs page with every loadable demo component registered.
 */
const DocsPage = createPage({
  loadableRegistry: {
    FlowComposer: {
      component: FlowComposer,
      runtimeTraits: runtimeTraits.wrapper
    },
    ExamplePreview: {
      component: ExamplePreview,
      runtimeTraits: runtimeTraits.wrapperAndSelection
    },
    ComponentWorkbench: {
      component: ComponentWorkbench,
      runtimeTraits: runtimeTraits.selection
    }
  }
});

export const dynamicParams = false;

export const generateStaticParams = getContentStaticParams;

export async function generateMetadata({
  params
}: {
  params: Promise<DocsRouteParams>;
}) {
  const { slug } = await params;

  return {
    title: slug.length > 0 ? formatContentTitle(slug) : 'Docs'
  };
}

export default async function Page({
  params
}: {
  params: Promise<DocsRouteParams>;
}) {
  const { locale, slug } = await params;
  const resolvedLocale = resolveSupportedLocale(locale);

  if (resolvedLocale !== locale || slug.length === 0) {
    notFound();
  }

  const artifact = await readPageDataArtifact();
  const props = artifact.routes[toPageDataKey(resolvedLocale, slug)];

  if (props == null) {
    notFound();
  }

  return <DocsPage {...props} />;
}
