import type { ComponentType } from 'react';
import { MdxContent } from '../mdx-runtime';
import {
  runtimeTrait,
  type RuntimeConfig,
  type RuntimeTrait
} from './runtime-traits';

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
type LoadableEntry = RuntimeConfig & {
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
 * @property code — Pre-compiled MDX code produced by the shared route module.
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

const hasRuntimeTrait = (
  entry: LoadableEntry,
  runtimeTraitKey: RuntimeTrait
): boolean => entry.runtimeTraits?.includes(runtimeTraitKey) ?? false;

const enhanceComponent = (
  entry: LoadableEntry
): ComponentType<Record<string, unknown>> => {
  const BaseComponent = entry.component;
  const requireWrapper = hasRuntimeTrait(entry, runtimeTrait.wrapper);
  const injectSelection = hasRuntimeTrait(entry, runtimeTrait.selection);

  if (!requireWrapper && !injectSelection) {
    return BaseComponent;
  }

  return props => {
    let content = <BaseComponent {...props} />;

    if (injectSelection) {
      content = (
        <div
          style={{
            margin: '1rem 0',
            border: '2px dashed #2563eb',
            borderRadius: '0.75rem',
            padding: '0.75rem',
            background: '#eff6ff'
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#1d4ed8',
              marginBottom: '0.5rem'
            }}
          >
            Selection Trait
          </div>
          {content}
        </div>
      );
    }

    if (requireWrapper) {
      content = (
        <div
          style={{
            margin: '1rem 0',
            border: '2px solid #f59e0b',
            borderRadius: '0.9rem',
            padding: '0.9rem',
            background: '#fffbeb',
            boxShadow: '0 0 0 4px rgba(245, 158, 11, 0.14)'
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#b45309',
              marginBottom: '0.5rem'
            }}
          >
            Wrapper Trait
          </div>
          {content}
        </div>
      );
    }

    return content;
  };
};

/**
 * Create a handler page component bound to a specific set of heavy components.
 *
 * The factory extracts the concrete React components from the registry subset
 * and closes over them, so the returned page component renders MDX content
 * with the correct component overrides without any runtime registry lookup.
 *
 * The returned component is server-safe for the App Router demo: the MDX
 * evaluation itself stays hook-free, while interactive leaf components opt
 * into client execution individually via `'use client'`.
 */
export function createHandlerPageFromRuntime<T extends LoadableRegistrySubset>({
  loadableRegistrySubset
}: HandlerPageFactoryInput<T>) {
  const components: MDXComponentMap = Object.fromEntries(
    Object.entries(loadableRegistrySubset).map(([key, entry]) => [
      key,
      enhanceComponent(entry)
    ])
  );

  const HandlerPage = ({ code }: HandlerPageProps) => {
    return <MdxContent code={code} components={components} />;
  };

  return HandlerPage;
}
