import type { ComponentType } from 'react';
import { MdxContent } from '../mdx-runtime';

/**
 * Map of component names to their React implementations.
 *
 * Keys are the tag names used in MDX source (e.g. `<Counter />`), values
 * are the React component that renders them.
 */
type MDXComponentMap = Record<string, ComponentType<Record<string, unknown>>>;

/**
 * One entry in the loadable component registry.
 *
 * Each entry wraps a concrete React component that will be injected into
 * the MDX rendering scope for a generated handler page.
 */
type LoadableEntry = {
  /**
   * The React component to render when the corresponding tag appears in MDX.
   */
  component: ComponentType<Record<string, unknown>>;
};

/**
 * Subset of the component registry relevant to a specific handler page.
 *
 * Only the components actually used by that page's MDX content are included,
 * keeping the client bundle free of unused heavy component imports.
 */
type LoadableRegistrySubset = Record<string, LoadableEntry>;

/**
 * Props injected by Next.js into a generated handler page.
 *
 * @property code — Pre-compiled MDX code produced by `getStaticProps`.
 * @property slug — Route slug segments identifying the content page.
 */
type HandlerPageProps = {
  code: string;
  slug: string[];
};

/**
 * Input to the handler page factory.
 *
 * @property loadableRegistrySubset — Components this handler page needs,
 *           keyed by the tag name used in MDX source.
 */
export type HandlerPageFactoryInput<T> = {
  loadableRegistrySubset: T;
};

/**
 * Create a handler page component bound to a specific set of heavy components.
 *
 * The factory extracts the concrete React components from the registry subset
 * and closes over them, so the returned page component renders MDX content
 * with the correct component overrides without any runtime registry lookup.
 */
export function createHandlerPageFromRuntime<T extends LoadableRegistrySubset>({
  loadableRegistrySubset
}: HandlerPageFactoryInput<T>) {
  const components: MDXComponentMap = Object.fromEntries(
    Object.entries(loadableRegistrySubset).map(([key, entry]) => [
      key,
      entry.component
    ])
  );

  const HandlerPage = ({ code }: HandlerPageProps) => {
    return <MdxContent code={code} components={components} />;
  };

  return HandlerPage;
}
