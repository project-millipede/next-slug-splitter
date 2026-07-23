import type { ComponentProps } from 'react';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle
} from 'fumadocs-ui/layouts/docs/page';
import type { MDXComponents, MDXContent } from 'mdx/types';

import { getMDXComponents } from '../../components/mdx';

type LoadableEntry = {
  component: NonNullable<MDXComponents[string]>;
};

type LoadableRegistrySubset = Record<string, LoadableEntry>;
type DocsPageProps = ComponentProps<typeof DocsPage>;

type FumadocsPageProps = {
  page: {
    data: {
      title: string;
      description?: string;
      toc?: DocsPageProps['toc'];
      full?: DocsPageProps['full'];
    };
  };
  MDX: MDXContent;
};

export type HandlerPageFactoryInput<T> = {
  loadableRegistrySubset: T;
};

const docsPageOptions = {
  footer: {
    /**
     * Disable Fumadocs previous/next footer links for this benchmark fixture.
     *
     * Footer behavior:
     * 1. Fumadocs derives previous and next pages from the docs page tree.
     * 2. In this small integration fixture, those links point at the same
     *    sibling routes already shown in the left navigation.
     *
     * Production consequence:
     * 1. The footer links use the framework link component.
     * 2. In Next.js App Router, omitted `prefetch` means default/auto prefetch
     *    behavior, not `false`.
     * 3. Neighbor page links can therefore prefetch route-specific chunks for
     *    pages the user has not opened.
     *
     * Benchmark reason:
     * 1. Previous/next prefetch would make sibling route chunks appear in
     *    browser measurements.
     * 2. That is a navigation prefetch policy consequence, not a bundler result
     *    and not splitter behavior.
     * 3. The integration disables this duplicate navigation so route-size
     *    measurements stay focused on the currently loaded page.
     */
    enabled: false
  }
};

export function createHandlerPageFromRuntime<T extends LoadableRegistrySubset>({
  loadableRegistrySubset
}: HandlerPageFactoryInput<T>) {
  const loadableEntries = Object.entries(loadableRegistrySubset);
  const loadableComponents: MDXComponents = {};

  for (const [key, entry] of loadableEntries) {
    loadableComponents[key] = entry.component;
  }

  const HandlerPage = ({ page, MDX }: FumadocsPageProps) => {
    const components = getMDXComponents(loadableComponents);

    return (
      <DocsPage
        toc={page.data.toc}
        full={page.data.full}
        footer={docsPageOptions.footer}
      >
        <DocsTitle>{page.data.title}</DocsTitle>
        {page.data.description == null ? null : (
          <DocsDescription>{page.data.description}</DocsDescription>
        )}
        <DocsBody>
          <MDX components={components} />
        </DocsBody>
      </DocsPage>
    );
  };

  return HandlerPage;
}
