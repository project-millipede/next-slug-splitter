/**
 * Content layer — file discovery and MDX compilation.
 *
 * Provides two operations consumed by the catch-all docs route
 * (`pages/docs/[...slug].tsx`):
 *
 * - `getAllContentSlugs` — walks the content directory tree and returns
 *   every MDX file as a Next.js static-path entry.
 * - `compileContentForSlug` — compiles a single localized MDX file into an IIFE
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

import { isSupportedLocale, type SupportedLocale } from './locale-utils';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Absolute path to the shared directory containing localized MDX pages. */
const CONTENT_DIR = path.join(
  process.cwd(),
  '..',
  'shared',
  'docs-content',
  'pages'
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single localized entry returned by `getStaticPaths` for the catch-all route.
 *
 * The shared content tree mirrors the App Router multi-locale demo:
 * `demo/shared/docs-content/pages/<slug>/<locale>.mdx`.
 */
type ContentSlugEntry = {
  params: { slug: string[] };
  locale: SupportedLocale;
};

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively collect all `.mdx` files under `dir`.
 *
 * Returns paths relative to `dir` (e.g. `"getting-started/en.mdx"`,
 * `"guides/advanced/de.mdx"`), preserving the directory structure that
 * maps directly to URL slug segments and localized filenames.
 *
 * @param dir - Absolute directory to scan.
 * @param base - Accumulated relative prefix used during recursion.
 * @returns Relative MDX file paths below the content root.
 */
const collectMdxFiles = async (dir: string, base = ''): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relative = base ? `${base}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const nested = await collectMdxFiles(
        path.join(dir, entry.name),
        relative
      );
      files.push(...nested);
    } else if (entry.name.endsWith('.mdx')) {
      files.push(relative);
    }
  }

  return files;
};

/**
 * Convert a localized relative MDX file path to a static path entry.
 *
 * The final filename segment must be a supported locale, matching the
 * App Router multi-locale demo's content shape:
 *
 * @example filePathToSlugEntry('guides/advanced/de.mdx')
 * // { locale: 'de', params: { slug: ['guides', 'advanced'] } }
 *
 * @param filePath - Relative MDX file path below the content root.
 * @returns Static path entry for one localized page, or `null` when skipped.
 */
const filePathToSlugEntry = (filePath: string): ContentSlugEntry | null => {
  const routeSegments = filePath.replace(/\.mdx$/, '').split('/');
  const localeSegmentIndex = routeSegments.length - 1;
  const locale = routeSegments[localeSegmentIndex];
  const slug = routeSegments.slice(0, localeSegmentIndex);

  if (locale == null || !isSupportedLocale(locale) || slug.length === 0) {
    return null;
  }

  return {
    locale,
    params: { slug }
  };
};

/**
 * Type guard for successfully parsed content slug entries.
 *
 * @param entry - Parsed static-path entry or `null`.
 * @returns `true` when the entry should be included in `getStaticPaths`.
 */
const isContentSlugEntry = (
  entry: ContentSlugEntry | null
): entry is ContentSlugEntry => entry != null;

/**
 * Build the deterministic sort key for a localized content slug.
 *
 * @param entry - Content slug entry to sort.
 * @returns Stable locale/slug sort key.
 */
const toContentSlugSortKey = (entry: ContentSlugEntry): string =>
  `${entry.locale}:${entry.params.slug.join('/')}`;

/**
 * Compare two localized content slug entries in deterministic locale/slug order.
 *
 * @param left - Left content slug entry.
 * @param right - Right content slug entry.
 * @returns Locale-sort comparison result.
 */
const compareContentSlugEntries = (
  left: ContentSlugEntry,
  right: ContentSlugEntry
): number =>
  toContentSlugSortKey(left).localeCompare(toContentSlugSortKey(right));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return every content slug as a Next.js static-path entry.
 *
 * Used by `getStaticPaths` in the catch-all docs route to enumerate
 * all available content pages at build time.
 *
 * @returns Localized static-path entries for docs pages.
 */
export const getAllContentSlugs = async (): Promise<ContentSlugEntry[]> => {
  const files = await collectMdxFiles(CONTENT_DIR);

  return files
    .map(filePathToSlugEntry)
    .filter(isContentSlugEntry)
    .sort(compareContentSlugEntries);
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
 * @param locale - Locale identifying the localized content file.
 * @param slug - Slug segments identifying the content page.
 * @returns Compiled MDX code as a self-contained IIFE string.
 */
export const compileContentForSlug = async (
  locale: SupportedLocale,
  slug: string[]
): Promise<string> => {
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

  const [compiledOutputFile] = result.outputFiles ?? [];
  if (compiledOutputFile == null) {
    throw new Error('Expected esbuild to emit one compiled MDX output file.');
  }

  const { text: code } = compiledOutputFile;
  return `${code};return Component;`;
};
