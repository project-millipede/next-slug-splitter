/**
 * App-owned page-data compiler — TypeScript variant.
 *
 * This file mirrors the JavaScript compiler module, but it is authored in
 * TypeScript and compiled to `dist/content-compiler.js` via the existing
 * `prepare` step before the isolated library worker loads it at runtime.
 */

import path from 'node:path';

import esbuild from 'esbuild';
import mdx from '@mdx-js/esbuild';
import { globalExternals } from '@fal-works/esbuild-plugin-global-externals';
import { definePageDataCompiler } from 'next-slug-splitter/next/page-data-compiler';

const CONTENT_DIR = path.join(process.cwd(), 'content', 'pages');

/**
 * Compile the MDX content for one slug into an evaluatable IIFE string.
 *
 * The output is an esbuild IIFE bundle with `globalName: 'Component'`.
 * A `return Component;` statement is appended so the `MdxContent` runtime can
 * execute the string via `new Function(...)` and receive the module exports
 * including the default MDX content component.
 *
 * React, ReactDOM, and the JSX runtime are declared as global externals.
 * The `MdxContent` runtime injects those globals at evaluation time instead
 * of bundling duplicate React runtimes into every compiled page.
 *
 * @param slug Slug segments identifying the content page.
 * @returns Bundled executable code consumed by the MDX runtime.
 */
const compileContentForSlug = async (slug: string[]): Promise<string> => {
  const filePath = path.join(CONTENT_DIR, ...slug) + '.mdx';

  const result = await esbuild.build({
    entryPoints: [filePath],
    write: false,
    bundle: true,
    format: 'iife',
    globalName: 'Component',
    target: 'es2020',
    treeShaking: false,
    minify: false,
    keepNames: true,
    jsx: 'automatic',
    jsxImportSource: 'react',
    plugins: [
      globalExternals({
        react: { varName: 'React', type: 'cjs' },
        'react-dom': { varName: 'ReactDOM', type: 'cjs' },
        'react/jsx-runtime': { varName: '_jsx_runtime', type: 'cjs' }
      }),
      mdx()
    ]
  });

  const code = result.outputFiles[0].text;
  return `${code};return Component;`;
};

export const pageDataCompiler = definePageDataCompiler<
  {
    slug: string[];
  },
  {
    code: string;
    slug: string[];
  }
>({
  /**
   * Compile the requested MDX page and return the route data consumed by the
   * demo route contract.
   *
   * @param compileInput Worker-owned compile invocation details.
   * @param compileInput.input Serializable route-contract payload.
   * @returns Compiled page data for one docs slug.
   */
  async compile(compileInput) {
    const { input } = compileInput;
    const slug = input?.slug;

    if (
      !Array.isArray(slug) ||
      slug.some(segment => typeof segment !== 'string')
    ) {
      throw new Error(
        'Demo pageDataCompiler expected input.slug to be a string array.'
      );
    }

    return {
      code: await compileContentForSlug(slug),
      slug
    };
  }
});
