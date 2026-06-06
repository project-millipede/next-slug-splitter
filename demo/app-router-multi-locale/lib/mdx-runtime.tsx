import { type ComponentType, type ReactNode } from 'react';
import React from 'react';
import ReactDOM from 'react-dom';
import * as jsxRuntime from 'react/jsx-runtime';

/**
 * Props accepted by an MDX content component.
 *
 * MDX components receive a `components` map that overrides the default HTML
 * element renderers with custom React components (e.g. `Counter`, `Chart`).
 */
type MDXContentProps = {
  components?: MDXComponentMap;
};

/**
 * Map of component names to their React implementations.
 *
 * Keys are the tag names used in MDX source (e.g. `<Counter />`), values
 * are the React component that renders them.
 */
type MDXComponentMap = Record<string, ComponentType<Record<string, unknown>>>;

/**
 * Props for the MdxContent runtime renderer.
 *
 * @property code       — Pre-compiled MDX code (esbuild IIFE format).
 * @property components — Optional component overrides injected into the MDX scope.
 */
type Props = {
  code: string;
  components?: MDXComponentMap;
};

/**
 * Shape returned by evaluating a compiled MDX module.
 *
 * The module's default export is the MDX content component.
 */
type MDXModuleResult = {
  default: ComponentType<MDXContentProps>;
};

/**
 * Evaluate compiled MDX code (esbuild IIFE format with `globalName: 'Component'`).
 *
 * The bundled code expects `React`, `ReactDOM`, and `_jsx_runtime` as globals.
 * Injected via `new Function` arguments. The single assertion at this
 * boundary is unavoidable — dynamic eval returns an untyped result.
 */
const evaluateMdx = (code: string): MDXModuleResult => {
  // eslint-disable-next-line no-new-func
  const fn = new Function('React', 'ReactDOM', '_jsx_runtime', code);
  return fn(React, ReactDOM, jsxRuntime) as MDXModuleResult;
};

export const MdxContent = ({ code, components }: Props): ReactNode => {
  const Content = evaluateMdx(code).default as ComponentType<MDXContentProps>;

  return <Content components={components} />;
};
