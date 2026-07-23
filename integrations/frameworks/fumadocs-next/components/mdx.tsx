import type { MDXComponents } from 'mdx/types';
import defaultMdxComponents from 'fumadocs-ui/mdx';

import { Callout } from '@next-slug-splitter/ballast-kit/callout';

/**
 * Build the MDX component map shared by the public Fumadocs route and
 * splitter-generated route handlers.
 *
 * @param components Route-specific component overrides.
 * @returns Fumadocs defaults plus the splitter demo components.
 */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Callout,
    ...components
  };
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
