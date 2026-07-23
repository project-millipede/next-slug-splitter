import { readdir } from 'node:fs/promises';
import path from 'node:path';

import type { ManifestKind } from './types';

export const GENERATED_HANDLERS_SEGMENT = '/docs/generated-handlers';
export const DEFAULT_LOCALE = 'en';
export const SUPPORTED_LOCALES = new Set(['en', 'de']);
export const MANIFEST_FILENAMES: Record<ManifestKind, string> = {
  splitter: 'splitter-route-payload.json',
  'heavy-baseline': 'heavy-baseline-route-payload.json'
};

/**
 * Check whether an unknown value is a plain object record.
 *
 * @param value Value to inspect.
 * @returns True when the value can be safely read by string keys.
 */
export const isObjectRecord = (
  value: unknown
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Check whether an unknown value is an array of strings.
 *
 * @param value Value to inspect.
 * @returns True when every array item is a string.
 */
export const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

/**
 * Check whether an environment value names a benchmark manifest kind.
 *
 * @param value Raw manifest kind value.
 * @returns True when the value maps to a supported manifest filename.
 */
export const isManifestKind = (value: string): value is ManifestKind =>
  value in MANIFEST_FILENAMES;

/**
 * Translate a Next.js optional catch-all route representation.
 */
const OPTIONAL_CATCH_ALL_ROUTE_TRANSLATION = {
  /**
   * 1. Recognize the complete optional catch-all input syntax.
   *
   * The start and end anchors require the complete value to follow the
   * `[[...param]]` representation.
   *
   * Examples:
   *
   *    a. `[[...slug]]` matches.
   *    b. `[...slug]` does not match.
   *    c. `[slug]` does not match.
   */
  inputSyntaxMatcher: /^\[\[\.\.\.[^\]]+\]\]$/,

  /**
   * 2. Produce the concrete-path matcher output.
   *
   * The fragment has three relevant parts:
   *
   *    a. `(?:...)` groups the slash and path without capturing them.
   *    b. `/.*` accepts a slash followed by any remaining path.
   *    c. The final `?` makes the complete group optional.
   *
   * When appended to `/docs`, the resulting matcher:
   *
   *    a. Matches `/docs`.
   *    b. Matches `/docs/guides`.
   *    c. Matches `/docs/guides/getting-started`.
   *
   * This value is source text inserted into the final regular expression, not
   * a standalone `RegExp`.
   */
  outputPathMatcherFragment: '(?:/.*)?'
};

/**
 * Translate a Next.js catch-all route representation.
 */
const CATCH_ALL_ROUTE_TRANSLATION = {
  /**
   * 1. Recognize the complete catch-all input syntax.
   *
   * The start and end anchors require the complete value to follow the
   * `[...param]` representation.
   *
   * Examples:
   *
   *    a. `[...slug]` matches.
   *    b. `[[...slug]]` does not match.
   *    c. `[slug]` does not match.
   */
  inputSyntaxMatcher: /^\[\.\.\.[^\]]+\]$/,

  /**
   * 2. Produce the concrete-path matcher output.
   *
   * The fragment has two relevant parts:
   *
   *    a. `/` requires the catch-all value to start after a slash.
   *    b. `.+` requires at least one character and accepts further slashes.
   *
   * When appended to `/docs`, the resulting matcher:
   *
   *    a. Matches `/docs/guides`.
   *    b. Matches `/docs/guides/getting-started`.
   *    c. Does not match `/docs`.
   *    d. Does not match `/docs/`.
   *
   * This value is source text inserted into the final regular expression, not
   * a standalone `RegExp`.
   */
  outputPathMatcherFragment: '/.+'
};

/**
 * Translate a Next.js dynamic route representation.
 */
const DYNAMIC_ROUTE_TRANSLATION = {
  /**
   * 1. Recognize the complete dynamic input syntax.
   *
   * The start and end anchors require the complete value to be enclosed by one
   * pair of square brackets.
   *
   * Examples:
   *
   *    a. `[locale]` matches.
   *    b. `docs` does not match.
   *    c. `[...slug]` also matches because this is the general dynamic form.
   *
   * The catch-all translation must therefore be checked before this broader
   * dynamic translation.
   */
  inputSyntaxMatcher: /^\[[^\]]+\]$/,

  /**
   * 2. Produce the concrete-path matcher output.
   *
   * The fragment has two relevant parts:
   *
   *    a. `/` requires the dynamic value to start after a slash.
   *    b. `[^/]+` requires characters but rejects another slash.
   *
   * When followed by `/docs`, the resulting matcher:
   *
   *    a. Matches `/en/docs`.
   *    b. Matches `/de/docs`.
   *    c. Does not match `/en/us/docs`.
   *
   * This value is source text inserted into the final regular expression, not
   * a standalone `RegExp`.
   */
  outputPathMatcherFragment: '/[^/]+'
};

/**
 * Match characters with special meaning in regular-expression source.
 *
 * Static route segments are literal path text, so every matching character is
 * prefixed with `\` before the segment is inserted into the generated matcher.
 *
 * Examples:
 *
 * 1. `docs.v2` becomes `docs\.v2`.
 * 2. `price+tax` becomes `price\+tax`.
 * 3. `docs` remains unchanged.
 */
const REGEXP_SYNTAX_CHARACTER = /[.*+?^${}()|[\]\\]/g;

/**
 * Build the matcher that connects a concrete benchmark path to its App Router
 * output.
 *
 * The resolution flow is:
 *
 * 1. Read an adapter route pattern such as `/[locale]/docs/[...slug]`.
 * 2. Split it on `/` and keep only segments whose length is greater than zero,
 *    discarding empty values from leading, trailing, or repeated slashes.
 * 3. Convert the remaining segments into regular-expression fragments:
 *    a. `[[...param]]` matches zero or more path segments.
 *    b. `[...param]` matches one or more path segments.
 *    c. `[param]` matches exactly one path segment.
 *    d. Static segments match their literal values.
 * 4. Test a concrete rewrite path such as `/en/docs/getting-started`.
 * 5. Use the matching output's client-reference manifest to resolve the
 *    route-specific client chunks.
 *
 * @param routePattern App Router pattern reported by the Next.js adapter.
 * @returns Full-path matcher for concrete paths owned by that pattern.
 */
export const routePatternToRegExp = (routePattern: string): RegExp => {
  const segments = routePattern
    .split('/')
    .filter(segment => segment.length > 0);
  const expression = segments
    .map(segment => {
      if (
        OPTIONAL_CATCH_ALL_ROUTE_TRANSLATION.inputSyntaxMatcher.test(segment)
      ) {
        return OPTIONAL_CATCH_ALL_ROUTE_TRANSLATION.outputPathMatcherFragment;
      }

      if (CATCH_ALL_ROUTE_TRANSLATION.inputSyntaxMatcher.test(segment)) {
        return CATCH_ALL_ROUTE_TRANSLATION.outputPathMatcherFragment;
      }

      if (DYNAMIC_ROUTE_TRANSLATION.inputSyntaxMatcher.test(segment)) {
        return DYNAMIC_ROUTE_TRANSLATION.outputPathMatcherFragment;
      }

      return `/${segment.replace(REGEXP_SYNTAX_CHARACTER, '\\$&')}`;
    })
    .join('');

  return new RegExp(`^${expression || '/'}$`);
};

/**
 * Remove the benchmark website facade prefix from a route path.
 *
 * @param zonePath Browser-visible facade prefix owned by the website.
 * @param value Route path that may include the facade prefix.
 * @returns Route path without the facade prefix.
 */
export const stripZonePath = (zonePath: string, value: string): string => {
  if (value === zonePath) {
    return '/';
  }

  return value.startsWith(`${zonePath}/`)
    ? value.slice(zonePath.length)
    : value;
};

/**
 * Match the single leading slash removed from a fallback chunk path.
 *
 * The `/_next/` facade prefix already supplies the required path separator.
 *
 * Examples:
 *
 * 1. `/static/chunks/app.js` becomes `static/chunks/app.js`.
 * 2. `static/chunks/app.js` remains unchanged.
 */
const CHUNK_PATH_LEADING_SLASH = /^\//;

/**
 * Normalize a build chunk path to the benchmark same-origin facade URL.
 *
 * @param zonePath Browser-visible facade prefix owned by the website.
 * @param chunkPath Chunk path emitted by a Next.js build manifest.
 * @returns Same-origin facade URL for the chunk.
 */
export const toFacadeChunkPath = (
  zonePath: string,
  chunkPath: string
): string => {
  if (chunkPath.startsWith(`${zonePath}/_next/`)) {
    return chunkPath;
  }

  if (chunkPath.startsWith('/_next/')) {
    return `${zonePath}${chunkPath}`;
  }

  if (chunkPath.startsWith('static/')) {
    return `${zonePath}/_next/${chunkPath}`;
  }

  return `${zonePath}/_next/${chunkPath.replace(CHUNK_PATH_LEADING_SLASH, '')}`;
};

/**
 * Remove duplicate values while preserving the first observed order.
 *
 * @param values Values that may contain duplicates.
 * @returns Ordered unique values.
 */
export const uniqueInOrder = <T>(values: T[]): T[] => [...new Set(values)];

/**
 * Recursively collect MDX file paths below a content directory.
 *
 * @param dir Directory to scan.
 * @param base Relative path accumulated by recursive calls.
 * @returns Relative MDX file paths.
 */
export const collectMdxFiles = async (
  dir: string,
  base = ''
): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = base ? `${base}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      files.push(
        ...(await collectMdxFiles(path.join(dir, entry.name), relativePath))
      );
    } else if (entry.name.endsWith('.mdx')) {
      files.push(relativePath);
    }
  }

  return files;
};
