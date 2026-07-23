import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { GetStaticPaths, GetStaticProps } from 'next';
import {
  ComponentWorkbench,
  ExamplePreview,
  FlowComposer
} from '@next-slug-splitter/ballast-kit';

import { createPage } from '../../lib/handler-factory/runtime';
import {
  resolveSupportedLocale,
  type SupportedLocale
} from '../../lib/locale-utils';

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
    ExamplePreview: {
      component: ExamplePreview,
      runtimeTraits: ['wrapper', 'selection']
    },
    FlowComposer: {
      component: FlowComposer,
      runtimeTraits: ['wrapper']
    },
    ComponentWorkbench: {
      component: ComponentWorkbench,
      runtimeTraits: ['selection']
    }
  }
});

export const getStaticProps: GetStaticProps<DocsPageProps> = async ctx => {
  const slug = ctx.params?.slug;

  if (!Array.isArray(slug)) {
    return { notFound: true };
  }

  const locale = resolveSupportedLocale(ctx.locale);
  const artifact = await readPageDataArtifact();
  const props = artifact.routes[toPageDataKey(locale, slug)];

  if (props == null) {
    return { notFound: true };
  }

  return {
    props
  };
};

export const getStaticPaths: GetStaticPaths = async () => {
  const artifact = await readPageDataArtifact();
  const paths = Object.values(artifact.routes).map(page => ({
    locale: page.locale,
    params: {
      slug: page.slug
    }
  }));

  return { paths, fallback: false };
};

export default DocsPage;
