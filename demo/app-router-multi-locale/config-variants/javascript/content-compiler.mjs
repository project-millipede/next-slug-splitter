/**
 * App-owned page-data compiler — JavaScript variant.
 *
 * This file mirrors the TypeScript compiler module, but it stays in native
 * ESM so the JavaScript config variant can load it directly at runtime
 * without a prepare step.
 */

import path from 'node:path';

import esbuild from 'esbuild';
import mdx from '@mdx-js/esbuild';
import { globalExternals } from '@fal-works/esbuild-plugin-global-externals';
import { definePageDataCompiler } from 'next-slug-splitter/next/page-data-compiler';

/**
 * @typedef {{ locale: 'en' | 'de', slug: string[] }} DemoPageDataCompilerInput
 * Serializable input payload sent by the route contract.
 */

/**
 * @typedef {{ code: string, locale: 'en' | 'de', slug: string[] }} DemoPageDataCompilerResult
 * Serializable result payload returned to the route contract.
 */

/**
 * @typedef {import('next-slug-splitter/next/page-data-compiler').AppPageDataCompiler<
 *   DemoPageDataCompilerInput,
 *   DemoPageDataCompilerResult
 * >} DemoPageDataCompiler
 * App-owned page-data compiler contract for the JavaScript demo variant.
 */

/** Absolute path to the shared directory containing localized MDX pages. */
const CONTENT_DIR = path.join(
  process.cwd(),
  '..',
  'shared',
  'docs-content',
  'pages'
);

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
 * @param {'en' | 'de'} locale Locale identifying the content file.
 * @param {string[]} slug Slug segments identifying the content page.
 * @returns {Promise<string>} Bundled executable code consumed by the MDX runtime.
 */
export const compileContentForSlug = async (locale, slug) => {
  const filePath = path.join(CONTENT_DIR, ...slug, `${locale}.mdx`);

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

  const [compiledOutputFile] = result.outputFiles;
  if (compiledOutputFile == null) {
    throw new Error('Expected esbuild to emit one compiled MDX output file.');
  }

  const { text: code } = compiledOutputFile;
  return `${code};return Component;`;
};

/** @type {DemoPageDataCompiler} */
export const pageDataCompiler = definePageDataCompiler({
  /**
   * Compile the requested MDX page and return the route data consumed by the
   * demo route contract.
   *
   * @param {{ targetId: string, input: DemoPageDataCompilerInput }} compileInput
   * Worker-owned compile invocation details.
   * @returns {Promise<DemoPageDataCompilerResult>}
   * Compiled page data for one docs slug.
   */
  async compile(compileInput) {
    const { input } = compileInput;
    const locale = input?.locale;
    const slug = input?.slug;

    if (locale !== 'en' && locale !== 'de') {
      throw new Error(
        'Demo pageDataCompiler expected input.locale to be "en" or "de".'
      );
    }

    if (
      !Array.isArray(slug) ||
      slug.some(segment => typeof segment !== 'string')
    ) {
      throw new Error(
        'Demo pageDataCompiler expected input.slug to be a string array.'
      );
    }

    return {
      code: await compileContentForSlug(locale, slug),
      locale,
      slug
    };
  }
});
