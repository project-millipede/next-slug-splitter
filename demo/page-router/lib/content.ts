/**
 * Content layer — file discovery and MDX compilation.
 *
 * Provides two operations consumed by the catch-all docs route
 * (`pages/docs/[...slug].tsx`):
 *
 * - `getAllContentSlugs` — walks the content directory tree and returns
 *   every MDX file as a Next.js static-path entry.
 * - `compileContentForSlug` — compiles a single MDX file into an IIFE
 *   string that the client-side `MdxContent` runtime can evaluate.
 *
 * The MDX compilation uses esbuild with the `@mdx-js/esbuild` plugin.
 * React, ReactDOM, and the JSX runtime are declared as global externals
 * so they are not bundled into the compiled output — the `MdxContent`
 * runtime injects them at evaluation time instead.
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';

import esbuild from 'esbuild';
import mdx from '@mdx-js/esbuild';
import { globalExternals } from '@fal-works/esbuild-plugin-global-externals';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Absolute path to the directory containing MDX content pages. */
const CONTENT_DIR = path.join(process.cwd(), 'content', 'pages');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single entry returned by `getStaticPaths` for the catch-all route. */
type ContentSlugEntry = {
  params: { slug: string[] };
};

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively collect all `.mdx` files under `dir`.
 *
 * Returns paths relative to `dir` (e.g. `"getting-started.mdx"`,
 * `"guides/advanced.mdx"`), preserving the directory structure that
 * maps directly to URL slug segments.
 *
 * @param dir  — Absolute directory to scan.
 * @param base — Accumulated relative prefix (used during recursion).
 */
const collectMdxFiles = async (
  dir: string,
  base = ''
): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relative = base ? `${base}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const nested = await collectMdxFiles(path.join(dir, entry.name), relative);
      files.push(...nested);
    } else if (entry.name.endsWith('.mdx')) {
      files.push(relative);
    }
  }

  return files;
};

/**
 * Convert a relative MDX file path to slug segments.
 *
 * Strips the `.mdx` extension and splits on `/`, producing the array
 * that Next.js expects for the `[...slug]` catch-all parameter.
 *
 * @example filePathToSlug('guides/advanced.mdx') // ['guides', 'advanced']
 */
const filePathToSlug = (filePath: string): string[] =>
  filePath.replace(/\.mdx$/, '').split('/');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return every content slug as a Next.js static-path entry.
 *
 * Used by `getStaticPaths` in the catch-all docs route to enumerate
 * all available content pages at build time.
 */
export const getAllContentSlugs = async (): Promise<ContentSlugEntry[]> => {
  const files = await collectMdxFiles(CONTENT_DIR);

  return files.map(file => ({
    params: { slug: filePathToSlug(file) }
  }));
};

/**
 * Compile the MDX content for a given slug into an evaluatable IIFE string.
 *
 * The output is an esbuild IIFE bundle with `globalName: 'Component'`.
 * A `return Component;` statement is appended so the `MdxContent` runtime
 * can execute the string via `new Function(...)` and receive the module
 * exports (including the default MDX content component).
 *
 * React, ReactDOM, and the JSX runtime are declared as global externals —
 * they are injected by the `MdxContent` runtime at evaluation time, not
 * bundled into the compiled output. This keeps the per-page payload small
 * and avoids duplicate React instances.
 *
 * @param slug — Slug segments identifying the content page (e.g. `['getting-started']`).
 * @returns Compiled MDX code as a self-contained IIFE string.
 */
export const compileContentForSlug = async (slug: string[]): Promise<string> => {
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
      /**
       * Declare React packages as global externals so esbuild replaces
       * `require('react')` etc. with references to the global variables
       * injected by the `MdxContent` runtime (`React`, `ReactDOM`,
       * `_jsx_runtime`).
       */
      globalExternals({
        react: { varName: 'React', type: 'cjs' },
        'react-dom': { varName: 'ReactDOM', type: 'cjs' },
        'react/jsx-runtime': { varName: '_jsx_runtime', type: 'cjs' }
      }),
      mdx()
    ]
  });

  const code = result.outputFiles![0].text;
  return `${code};return Component;`;
};
