/**
 * Remove only leading and trailing route separators from one path fragment.
 *
 * 1. This helper trims only edge `/` characters.
 * 2. It does not alter nested path separators inside the fragment.
 * 3. Multi-segment fragments such as `/a/b/` remain valid as `a/b`.
 * 4. Use this only as the transition step before joining route fragments.
 * 5. Internal route shape should already be valid before calling this helper.
 *
 * @example
 * // Single segment edge separators
 * '/a'  -> 'a'
 * 'a/'  -> 'a'
 * '/a/' -> 'a'
 *
 * // Multi-segment fragments keep internal separators
 * '/a/b/'  -> 'a/b'
 * '/a//b/' -> 'a//b'
 *
 * // Root-only fragment becomes empty
 * '/' -> ''
 *
 * @param value Path fragment to normalize.
 * @returns The same value without leading or trailing `/` characters.
 */
const trimEdgeRouteSeparators = (value: string): string => {
  let startIndex = 0;
  let endIndex = value.length;

  while (startIndex < endIndex && value[startIndex] === '/') {
    startIndex += 1;
  }

  while (endIndex > startIndex && value[endIndex - 1] === '/') {
    endIndex -= 1;
  }

  return value.slice(startIndex, endIndex);
};

/**
 * Convert one optional route fragment into a non-empty route fragment.
 *
 * 1. This helper accepts one raw route fragment.
 * 2. It ignores `undefined` fragments.
 * 3. It trims only edge `/` characters.
 * 4. It returns `undefined` when the fragment becomes empty.
 * 5. It does not alter nested path separators inside the fragment.
 *
 * @example
 * // Single segment fragments
 * '/a'  -> 'a'
 * 'a/'  -> 'a'
 * '/a/' -> 'a'
 *
 * // Multi-segment fragments keep internal separators
 * '/a/b/'  -> 'a/b'
 * '/a//b/' -> 'a//b'
 *
 * // Empty fragments are skipped
 * '/'       -> undefined
 * undefined -> undefined
 *
 * @param routeFragment Raw route fragment to convert.
 * @returns Edge-trimmed route fragment, or `undefined` when empty.
 */
const toNonEmptyRouteFragment = (
  routeFragment: string | undefined
): string | undefined => {
  if (routeFragment == null) {
    return undefined;
  }

  const trimmedRouteFragment = trimEdgeRouteSeparators(routeFragment);
  if (trimmedRouteFragment.length === 0) {
    return undefined;
  }

  return trimmedRouteFragment;
};

/**
 * Collect route fragments that contribute to an absolute route path.
 *
 * 1. This helper receives the target base route and optional child fragments.
 * 2. It converts each input through `toNonEmptyRouteFragment`.
 * 3. It skips inputs that do not contribute a fragment.
 * 4. It returns a new array and does not mutate caller-owned data.
 * 5. It preserves the order of all contributing fragments.
 *
 * @param routeBasePath Base route path that owns the target.
 * @param routeFragments Optional child route fragments.
 * @returns New list of non-empty route fragments.
 */
const collectRouteFragments = (
  routeBasePath: string,
  routeFragments: Array<string | undefined>
): Array<string> => {
  const collectedRouteFragments: Array<string> = [];

  for (const routeFragment of [routeBasePath, ...routeFragments]) {
    const nonEmptyRouteFragment = toNonEmptyRouteFragment(routeFragment);
    if (nonEmptyRouteFragment == null) {
      continue;
    }

    collectedRouteFragments.push(nonEmptyRouteFragment);
  }

  return collectedRouteFragments;
};

/**
 * Convert normalized route fragments into one absolute route path.
 *
 * 1. This helper receives already-normalized route fragments.
 * 2. It joins fragments by inserting one `/` between array entries.
 * 3. It adds the leading `/` required by Next route paths.
 * 4. It returns `/` when no fragments are present.
 * 5. It does not trim, validate, or rewrite separators inside each fragment.
 *
 * @example
 * // Empty fragment list becomes root
 * []         -> '/'
 *
 * // Single fragment path
 * ['a']      -> '/a'
 *
 * // Multiple fragments become one path
 * ['a', 'b'] -> '/a/b'
 *
 * // Internal separators are preserved inside a fragment
 * ['a/b']    -> '/a/b'
 * ['a//b']   -> '/a//b'
 *
 * @param routeFragments Normalized route fragments to format.
 * @returns Absolute route path beginning with `/`.
 */
const createAbsoluteRoutePathFromFragments = (
  routeFragments: Array<string>
): string => {
  if (routeFragments.length === 0) {
    return '/';
  }

  const relativeRoutePath = routeFragments.join('/');
  return `/${relativeRoutePath}`;
};

/**
 * Create an absolute Next rewrite route path from route fragments.
 *
 * 1. This helper is scoped to rewrite source and destination construction.
 * 2. It treats the base path and child values as route fragments.
 * 3. It trims only edge `/` characters from each fragment.
 * 4. It preserves nested separators inside trusted fragments.
 * 5. It returns an absolute route path suitable for Next rewrites.
 *
 * @example
 * // Base path only
 * '/'  + [] -> '/'
 * '/a' + [] -> '/a'
 *
 * // Base path with child fragments
 * '/a'  + ['b']   -> '/a/b'
 * '/a/' + ['/b/'] -> '/a/b'
 *
 * // Multi-segment fragments keep internal separators
 * '/' + ['/a/b/']  -> '/a/b'
 * '/' + ['/a//b/'] -> '/a//b'
 *
 * @param routeBasePath Base route path that owns the rewrite target.
 * @param routeFragments Optional child route fragments to append.
 * @returns Absolute joined route path for a Next rewrite.
 */
export const createAbsoluteRewriteRoutePath = (
  routeBasePath: string,
  ...routeFragments: Array<string | undefined>
): string => {
  const collectedRouteFragments = collectRouteFragments(
    routeBasePath,
    routeFragments
  );

  return createAbsoluteRoutePathFromFragments(collectedRouteFragments);
};
