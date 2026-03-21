import { access, readdir } from 'node:fs/promises';
import path from 'path';
import globFiles from 'fast-glob';

import { isNonEmptyString } from '../utils/type-guards-extended';
import type {
  ContentLocaleMode,
  LocaleConfig,
  LocalizedRoutePath,
  RouteIdentity
} from './types';

/**
 * Convert a filesystem path to POSIX separators.
 *
 * @param value - Filesystem path value.
 * @returns POSIX-normalized path string.
 */
export const toPosix = (value: string): string =>
  value.split(path.sep).join('/');

/**
 * Convert slug segments into a slash-separated slug path.
 *
 * @param slugArray - Ordered slug segments.
 * @returns Slash-separated slug path, or an empty string for the root route.
 */
export const toSlugPath = (slugArray: Array<string>): string =>
  slugArray.length > 0 ? slugArray.join('/') : '';

/**
 * Build the public route path for a target route base and slug segments.
 *
 * @param routeBasePath - Public route base path owned by the target.
 * @param slugArray - Ordered slug segments.
 * @returns Full public route path.
 */
export const toRoutePath = (
  routeBasePath: string,
  slugArray: Array<string>
): string => {
  const slugPath = toSlugPath(slugArray);
  return slugPath.length > 0 ? `${routeBasePath}/${slugPath}` : routeBasePath;
};

/**
 * Compare two ordered string arrays lexicographically.
 *
 * @param left - Left string array.
 * @param right - Right string array.
 * @returns A negative number when `left` sorts before `right`, a positive
 * number when `left` sorts after `right`, or `0` when both arrays are equal.
 *
 * @remarks
 * This keeps route identity comparison structured instead of flattening the
 * arrays into one delimiter-based string first.
 */
export const compareStringArrays = (
  left: Array<string>,
  right: Array<string>
): number => {
  const sharedLength = Math.min(left.length, right.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const comparison = left[index].localeCompare(right[index]);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return left.length - right.length;
};

/**
 * Compare two localized route identities by locale first and slug segments
 * second.
 *
 * @template TRoute - Route-like record carrying `locale` and `slugArray`.
 * @param left - Left route identity.
 * @param right - Right route identity.
 * @returns A stable ordering for localized route records.
 */
export const compareLocalizedRouteIdentity = <TRoute extends RouteIdentity>(
  left: TRoute,
  right: TRoute
): number => {
  const localeComparison = left.locale.localeCompare(right.locale);
  return localeComparison !== 0
    ? localeComparison
    : compareStringArrays(left.slugArray, right.slugArray);
};

/**
 * Determine whether two localized route identities are equal.
 *
 * @template TRoute - Route-like record carrying `locale` and `slugArray`.
 * @param left - Left route identity.
 * @param right - Right route identity.
 * @returns `true` when both identities represent the same locale and slug
 * sequence.
 */
const hasSameLocalizedRouteIdentity = <TRoute extends RouteIdentity>(
  left: TRoute,
  right: TRoute
): boolean => compareLocalizedRouteIdentity(left, right) === 0;

/**
 * Build the stable handler id used in generated file headers and diagnostics.
 *
 * @param locale - Locale of the source route.
 * @param slugArray - Ordered slug segments for the route.
 * @returns Stable handler id for the localized route.
 */
export const toHandlerId = (
  locale: string,
  slugArray: Array<string>
): string => {
  const slugKey = slugArray.length > 0 ? slugArray.join('-') : 'index';
  return `${locale}-${slugKey}`;
};

/**
 * Build the relative output path for a generated handler page.
 *
 * @param locale - Locale of the source route.
 * @param slugArray - Ordered slug segments for the route.
 * @param options - Output-path options.
 * @returns Relative handler output path.
 */
export const toHandlerRelativePath = (
  locale: string,
  slugArray: Array<string>,
  {
    includeLocaleLeaf = true
  }: {
    /**
     * Whether the locale should be emitted as the leaf path segment.
     */
    includeLocaleLeaf?: boolean;
  } = {}
): string => {
  if (!includeLocaleLeaf) {
    const slugPath = toSlugPath(slugArray);
    return slugPath.length > 0 ? slugPath : 'index';
  }

  if (slugArray.length === 0) {
    return locale;
  }

  return `${toSlugPath(slugArray)}/${locale}`;
};

/**
 * Deduplicate and sort a string array deterministically.
 *
 * @param values - String values to normalize.
 * @returns Unique string values in locale-sorted order.
 */
export const sortStringArray = (values: Array<string>): Array<string> =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b));

/**
 * Discover localized content routes below the configured content pages
 * directory.
 *
 * @param contentPagesDir - Content pages directory to scan.
 * @param localeConfig - Locale configuration used to interpret localized routes.
 * @param contentLocaleMode - Mode describing how locale participation is encoded
 * in content files.
 * @returns Localized route paths discovered below the content root.
 */
export const discoverLocalizedContentRoutes = async (
  contentPagesDir: string,
  localeConfig: LocaleConfig,
  contentLocaleMode: ContentLocaleMode = 'filename'
): Promise<Array<LocalizedRoutePath>> => {
  const locales = localeConfig.locales;
  const files = await globFiles(['**/*.{md,mdx}'], { cwd: contentPagesDir });

  const tuples: Array<LocalizedRoutePath> = [];
  for (const file of files) {
    const normalized = toPosix(file);
    const parts = normalized.split('/');
    const fileName = parts.pop();
    if (!isNonEmptyString(fileName)) {
      continue;
    }

    if (contentLocaleMode === 'filename') {
      const [locale] = fileName.split('.');
      if (!isNonEmptyString(locale) || !locales.includes(locale)) {
        continue;
      }

      tuples.push({
        locale,
        slugArray: parts,
        filePath: path.resolve(contentPagesDir, normalized)
      });
      continue;
    }

    const extensionIndex = fileName.lastIndexOf('.');
    const baseName =
      extensionIndex === -1 ? fileName : fileName.slice(0, extensionIndex);
    if (!isNonEmptyString(baseName)) {
      continue;
    }

    tuples.push({
      locale: localeConfig.defaultLocale,
      slugArray: [...parts, baseName],
      filePath: path.resolve(contentPagesDir, normalized)
    });
  }

  const sortedTuples = [...tuples].sort(compareLocalizedRouteIdentity);
  const deduped: Array<LocalizedRoutePath> = [];

  for (const tuple of sortedTuples) {
    const previousTuple = deduped[deduped.length - 1];
    if (previousTuple && hasSameLocalizedRouteIdentity(previousTuple, tuple)) {
      deduped[deduped.length - 1] = tuple;
      continue;
    }

    deduped.push(tuple);
  }

  return deduped;
};

/**
 * Candidate input for resolving one localized route identity to one concrete
 * source file without scanning the full content tree.
 */
export type ResolveLocalizedContentRouteInput = {
  /**
   * Content pages directory to resolve from.
   */
  contentPagesDir: string;
  /**
   * Locale configuration used to interpret localized routes.
   */
  localeConfig: LocaleConfig;
  /**
   * Mode describing how locale participation is encoded in content files.
   */
  contentLocaleMode?: ContentLocaleMode;
  /**
   * Localized route identity being resolved.
   */
  identity: RouteIdentity;
};

/**
 * Check whether one path exists on disk.
 *
 * @param filePath - Absolute candidate path.
 * @returns `true` when the path exists.
 */
const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Read one directory when present and return an empty list otherwise.
 *
 * @param directoryPath - Absolute directory path.
 * @returns Directory entry names, or an empty list when the directory is
 * missing.
 */
const readDirectoryEntriesIfPresent = async (
  directoryPath: string
): Promise<Array<string>> => {
  try {
    const entries = await readdir(directoryPath, {
      withFileTypes: true
    });
    return entries.filter(entry => entry.isFile()).map(entry => entry.name);
  } catch {
    return [];
  }
};

/**
 * Determine whether one filename is a valid match for a filename-mode localized
 * route identity.
 *
 * @param fileName - Candidate filename within one slug directory.
 * @param locale - Requested locale.
 * @returns `true` when the filename can satisfy the requested localized route.
 *
 * @remarks
 * The full-tree discovery logic accepts locale-prefixed variants such as:
 * - `en.mdx`
 * - `en.page.mdx`
 * - `en.something.md`
 *
 * The lazy request path must preserve that flexibility, but it only needs to
 * inspect the one target directory that corresponds to the requested slug.
 */
const isFilenameModeLocalizedRouteCandidate = ({
  fileName,
  locale
}: {
  fileName: string;
  locale: string;
}): boolean =>
  new RegExp(
    `^${locale.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?:\\..+)?\\.(?:md|mdx)$`
  ).test(fileName);

/**
 * Resolve one localized route identity to one concrete source file using a
 * path-local lookup instead of a full-tree content scan.
 *
 * @param input - Resolution input.
 * @param input.contentPagesDir - Content pages directory to resolve from.
 * @param input.localeConfig - Locale configuration used to interpret routes.
 * @param input.contentLocaleMode - Mode describing how locale participation is
 * encoded in content files.
 * @param input.identity - Localized route identity being resolved.
 * @returns Concrete localized route path when present, otherwise `null`.
 *
 * @remarks
 * This helper is the path-local counterpart to `discoverLocalizedContentRoutes`.
 * It intentionally resolves only one requested route identity and does not
 * enumerate unrelated files elsewhere in the content tree.
 *
 * Resolution rules mirror the existing discovery semantics:
 * - `filename` mode looks only in the requested slug directory and accepts any
 *   locale-prefixed markdown filename for that locale
 * - `default-locale` mode resolves only the default locale and maps the last
 *   slug segment to the markdown filename
 */
export const resolveLocalizedContentRoute = async ({
  contentPagesDir,
  localeConfig,
  contentLocaleMode = 'filename',
  identity
}: ResolveLocalizedContentRouteInput): Promise<LocalizedRoutePath | null> => {
  if (contentLocaleMode === 'filename') {
    const routeDirectoryPath = path.resolve(contentPagesDir, ...identity.slugArray);
    const matchedFileName = (
      await readDirectoryEntriesIfPresent(routeDirectoryPath)
    )
      .filter(fileName =>
        isFilenameModeLocalizedRouteCandidate({
          fileName,
          locale: identity.locale
        })
      )
      .sort((left, right) => left.localeCompare(right))
      .at(-1);

    if (!isNonEmptyString(matchedFileName)) {
      return null;
    }

    return {
      locale: identity.locale,
      slugArray: identity.slugArray,
      filePath: path.resolve(routeDirectoryPath, matchedFileName)
    };
  }

  if (identity.locale !== localeConfig.defaultLocale) {
    return null;
  }

  if (identity.slugArray.length === 0) {
    // The current discovery model for default-locale mode derives route slugs
    // from markdown basenames, so there is no empty-slug file shape to resolve
    // here.
    return null;
  }

  const baseFilePath = path.resolve(contentPagesDir, ...identity.slugArray);
  const candidateFilePaths = [`${baseFilePath}.mdx`, `${baseFilePath}.md`];

  for (const candidateFilePath of candidateFilePaths) {
    if (await fileExists(candidateFilePath)) {
      return {
        locale: identity.locale,
        slugArray: identity.slugArray,
        filePath: candidateFilePath
      };
    }
  }

  return null;
};
