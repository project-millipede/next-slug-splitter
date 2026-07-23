import type { ComponentType, ReactNode } from 'react';
import { Callout } from '@next-slug-splitter/ballast-kit/callout';
import { MdxContent } from '../mdx-runtime';
import {
  runtimeTrait,
  type RuntimeConfig,
  type RuntimeTrait
} from './runtime-traits';

/**
 * Map of component names to their React implementations.
 *
 * Keys are the tag names used in MDX source (e.g. `<ExamplePreview />`), values
 * are the React component that renders them.
 */
type MDXComponentProps = Record<string, unknown> & {
  /** Nested MDX children passed through custom components. */
  children?: ReactNode;
};

/** Component override map injected into the MDX runtime. */
type MDXComponentMap = Record<string, ComponentType<MDXComponentProps>>;

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
  component: ComponentType<MDXComponentProps>;
};

/**
 * Subset of the component registry relevant to a specific handler page.
 *
 * Only the components actually used by that page's MDX content are included,
 * keeping the client bundle free of unused heavy component imports.
 */
type LoadableRegistrySubset = Record<string, LoadableEntry>;

/**
 * Full loadable component registry available to an unsplit MDX page.
 *
 * The heavy baseline uses this shape because it intentionally keeps every
 * loadable component reachable from the catch-all route.
 */
type LoadableRegistry = Record<string, LoadableEntry>;

/**
 * Props injected by Next.js into a generated handler page.
 *
 * @property code — Pre-compiled MDX code produced by the route data loader.
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
 * Input to the neutral page factory used by unsplit baseline pages.
 *
 * @property loadableRegistry — Full component registry available to the page,
 *           keyed by the tag name used in MDX source.
 */
export type PageFactoryInput<T> = {
  loadableRegistry: T;
};

/**
 * Lightweight components always available in the MDX component scope.
 *
 * These components may be captured from MDX, but the demo processor omits them
 * from generated handler imports because they do not cross the loadable package
 * boundary.
 */
const mdxScopeComponents: MDXComponentMap = {
  Callout
};

/**
 * Check whether a registry entry declares a runtime trait.
 *
 * @param entry - Loadable registry entry to inspect.
 * @param runtimeTraitKey - Runtime trait to check for.
 * @returns `true` when the entry includes the requested trait.
 */
const hasRuntimeTrait = (
  entry: LoadableEntry,
  runtimeTraitKey: RuntimeTrait
): boolean => entry.runtimeTraits?.includes(runtimeTraitKey) ?? false;

/**
 * Wrap a loadable MDX component according to its runtime traits.
 *
 * The demo uses this to make selected/generated components visually obvious
 * without changing the MDX source. Components without wrapper or selection
 * traits are returned unchanged.
 *
 * @param entry - Loadable registry entry containing the component and traits.
 * @returns React component ready to inject into the MDX component scope.
 */
const enhanceComponent = (
  entry: LoadableEntry
): ComponentType<MDXComponentProps> => {
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
 * The returned component stays router-neutral for the demos: generated
 * handlers import only the component subset captured from that route's MDX.
 *
 * @param input - Handler factory input.
 * @param input.loadableRegistrySubset - Components needed by this handler.
 * @returns Page component that renders compiled MDX with scoped components.
 */
export function createHandlerPageFromRuntime<T extends LoadableRegistrySubset>({
  loadableRegistrySubset
}: HandlerPageFactoryInput<T>) {
  return createPageFromRuntime({
    loadableRegistry: loadableRegistrySubset
  });
}

/**
 * Create a page component bound to a loadable component registry.
 *
 * The factory extracts the concrete React components from the registry and
 * closes over them, so the returned page component renders compiled MDX with
 * the correct component overrides without any runtime registry lookup.
 *
 * This neutral alias is useful for unsplit baseline pages, where the registry
 * is intentionally the full catch-all component scope rather than a captured
 * splitter subset.
 *
 * @param input - MDX page factory input.
 * @param input.loadableRegistry - Components available to the MDX page.
 * @returns Page component that renders compiled MDX with scoped components.
 */
export function createPageFromRuntime<T extends LoadableRegistry>({
  loadableRegistry
}: PageFactoryInput<T>) {
  const loadableComponents: MDXComponentMap = Object.fromEntries(
    Object.entries(loadableRegistry).map(([key, entry]) => [
      key,
      enhanceComponent(entry)
    ])
  );
  const components: MDXComponentMap = {
    ...mdxScopeComponents,
    ...loadableComponents
  };

  const HandlerPage = ({ code }: HandlerPageProps) => {
    return <MdxContent code={code} components={components} />;
  };

  return HandlerPage;
}
