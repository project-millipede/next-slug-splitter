/**
 * Page-safe content layer — file discovery and title formatting only.
 *
 * This module intentionally stays free of the MDX compiler toolchain.
 * The route-owned App contract imports it at module top level inside the App
 * server graph, so only page-safe helpers should live here.
 *
 * The heavier MDX compilation path now lives in `content-compiler.ts`, which
 * the route contract loads only when it actually needs page data.
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Absolute path to the directory containing MDX content pages. */
const CONTENT_DIR = path.join(process.cwd(), 'content', 'pages');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single entry returned by `generateStaticParams` for the catch-all route. */
type ContentStaticParamEntry = {
  slug: string[];
};

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively collect all `.mdx` files under `dir`.
 *
 * Returns paths relative to `dir` (e.g. `"getting-started.mdx"`,
 * `"guides/advanced.mdx"`), preserving the directory structure that maps
 * directly to URL slug segments.
 *
 * @param dir - Absolute directory to scan.
 * @param base - Accumulated relative prefix used during recursion.
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
 * Strips the `.mdx` extension and splits on `/`, producing the array that App
 * Router expects for the `[...slug]` catch-all parameter.
 *
 * @example filePathToSlug('guides/advanced.mdx') // ['guides', 'advanced']
 */
const filePathToSlug = (filePath: string): string[] =>
  filePath.replace(/\.mdx$/, '').split('/');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return every content slug as an App Router `generateStaticParams` entry.
 *
 * Used by the route-owned App docs contract to enumerate all available content
 * pages at build time.
 */
export const getStaticParams = async (): Promise<Array<ContentStaticParamEntry>> => {
  const files = await collectMdxFiles(CONTENT_DIR);

  return files.map(file => ({
    slug: filePathToSlug(file)
  }));
};

/**
 * Derive a human-readable title from slug segments.
 *
 * @param slug - Slug segments identifying the content page.
 * @returns Title text suitable for `generateMetadata`.
 */
export const formatContentTitle = (slug: string[]): string =>
  slug
    .map(segment =>
      segment
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    )
    .join(' / ');
