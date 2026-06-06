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

import { isSupportedLocale, type SupportedLocale } from './locale-utils';

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
  locale: SupportedLocale;
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
 * Convert one localized content file path into App Router static params.
 *
 * 1. The `.mdx` extension is removed.
 * 2. The final path segment is treated as the locale filename.
 * 3. The preceding path segments become the `[...slug]` route param.
 * 4. Unsupported locale filenames are ignored.
 * 5. Locale-only paths are ignored because they do not point to a docs page.
 *
 * @example
 * // Localized docs page
 * 'guides/advanced/de.mdx' -> { locale: 'de', slug: ['guides', 'advanced'] }
 *
 * // Unsupported locale filename
 * 'guides/advanced/fr.mdx' -> null
 *
 * // Locale-only path
 * 'de.mdx' -> null
 *
 * @param filePath - Relative MDX file path below the content root.
 * @returns Static params for one docs page, or `null` when the file is skipped.
 */
const filePathToRouteParams = (
  filePath: string
): ContentStaticParamEntry | null => {
  const routeSegments = filePath.replace(/\.mdx$/, '').split('/');
  const localeSegmentIndex = routeSegments.length - 1;
  const locale = routeSegments[localeSegmentIndex];
  const slug = routeSegments.slice(0, localeSegmentIndex);
  const hasContentSlug = slug.length > 0;

  if (locale == null || !isSupportedLocale(locale)) {
    return null;
  }

  if (!hasContentSlug) {
    return null;
  }

  return {
    locale,
    slug
  };
};

/**
 * Type guard for successfully parsed content static params.
 *
 * 1. `filePathToRouteParams(...)` returns `null` for skipped files.
 * 2. A `true` result narrows the entry to `ContentStaticParamEntry`.
 *
 * @param entry - Parsed static-param entry or `null`.
 * @returns `true` when the entry should be included.
 */
const isContentStaticParamEntry = (
  entry: ContentStaticParamEntry | null
): entry is ContentStaticParamEntry => entry != null;

/**
 * Build the deterministic sort key for one content static-param entry.
 *
 * 1. Locale is sorted first.
 * 2. Slug segments are sorted by their slash-joined route path.
 *
 * @example
 * { locale: 'de', slug: ['guides', 'advanced'] }
 *   -> 'de:guides/advanced'
 *
 * @param entry - Content static-param entry to sort.
 * @returns Stable locale/slug sort key.
 */
const toContentStaticParamSortKey = (
  entry: ContentStaticParamEntry
): string => `${entry.locale}:${entry.slug.join('/')}`;

/**
 * Compare two content static-param entries in deterministic locale/slug order.
 *
 * @param left - Left content static-param entry.
 * @param right - Right content static-param entry.
 * @returns Locale-sort comparison result.
 */
const compareContentStaticParams = (
  left: ContentStaticParamEntry,
  right: ContentStaticParamEntry
): number =>
  toContentStaticParamSortKey(left).localeCompare(
    toContentStaticParamSortKey(right)
  );

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return localized App Router static params for every docs content page.
 *
 * 1. MDX files are discovered below the content root.
 * 2. Files with unsupported locale filenames are skipped.
 * 3. Locale-only files are skipped because they do not map to a docs page.
 * 4. Returned entries are sorted for deterministic `generateStaticParams`
 *    output.
 *
 * @returns Localized `{ locale, slug }` static params for docs pages.
 */
export const getStaticParams = async (): Promise<
  Array<ContentStaticParamEntry>
> => {
  const files = await collectMdxFiles(CONTENT_DIR);
  const entries = files
    .map(filePathToRouteParams)
    .filter(isContentStaticParamEntry);

  return entries.sort(compareContentStaticParams);
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
