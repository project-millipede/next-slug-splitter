import type { LocaleConfig } from '../../core/types';

/**
 * Split one browser-visible rewrite source pathname into path segments.
 *
 * 1. This helper is for source/public pathnames, not rewrite destinations.
 * 2. Empty path segments are ignored.
 * 3. The returned array is always a new array.
 *
 * @param sourcePathname - Browser-visible rewrite source pathname.
 * @returns New list of non-empty source path segments.
 */
export const toSourcePathSegments = (
  sourcePathname: string
): Array<string> =>
  sourcePathname.split('/').filter(segment => segment.length > 0);

/**
 * Check whether a source/public pathname starts with a configured locale.
 *
 * 1. This helper is for browser-visible rewrite sources, not rewrite
 *    destinations.
 * 2. Only the first source segment is inspected.
 * 3. Locale-looking segments elsewhere in the path are ignored.
 * 4. The input pathname is never mutated.
 *
 * @example
 * // Locale-prefixed source path
 * '/de/a' -> true
 *
 * // Unprefixed source path
 * '/a/de' -> false
 *
 * // Empty source path
 * '/' -> false
 *
 * @param sourcePathname - Browser-visible rewrite source pathname.
 * @param localeConfig - Locale semantics for the current app.
 * @returns `true` when the source pathname starts with a configured locale.
 */
export const hasLocalePrefix = (
  sourcePathname: string,
  localeConfig: LocaleConfig
): boolean => {
  const [leadingSourcePathSegment] = toSourcePathSegments(sourcePathname);

  return (
    leadingSourcePathSegment != null &&
    localeConfig.locales.includes(leadingSourcePathSegment)
  );
};

/**
 * Remove only a leading locale prefix from source/public path segments.
 *
 * 1. This helper is for browser-visible rewrite sources, not rewrite
 *    destinations.
 * 2. Only the first source segment is inspected.
 * 3. If the first segment is a configured locale, it is removed.
 * 4. Locale-looking segments elsewhere in the path are preserved.
 * 5. The returned array is always a new array.
 *
 * @example
 * // Locale-prefixed source path
 * ['de', 'a', 'generated-handlers', 'x', 'de']
 *   -> ['a', 'generated-handlers', 'x', 'de']
 *
 * // Unprefixed source path
 * ['a', 'generated-handlers', 'x', 'de']
 *   -> ['a', 'generated-handlers', 'x', 'de']
 *
 * // Empty source path
 * []
 *   -> []
 *
 * @param sourcePathSegments - Browser-visible rewrite source path segments.
 * @param localeConfig - Locale semantics for the current app.
 * @returns New source path segments without a leading locale prefix.
 */
export const removeLocalePrefix = (
  sourcePathSegments: ReadonlyArray<string>,
  localeConfig: LocaleConfig
): Array<string> => {
  const [leadingSourcePathSegment, ...remainingSourcePathSegments] =
    sourcePathSegments;

  if (leadingSourcePathSegment == null) {
    return [];
  }

  if (localeConfig.locales.includes(leadingSourcePathSegment)) {
    return remainingSourcePathSegments;
  }

  return [leadingSourcePathSegment, ...remainingSourcePathSegments];
};
