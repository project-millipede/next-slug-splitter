/**
 * Composes a composite key from multiple parts.
 *
 * @remarks
 * Joins parts into a stable string identifier using JSON serialization.
 * Useful for creating cache keys, deduplication keys, or composite identifiers.
 *
 * @example
 * ```typescript
 * composeKey('blog', '/tmp/app/blog/src/pages/post.mdx')
 * // '["blog","/tmp/app/blog/src/pages/post.mdx"]'
 * ```
 *
 * @param parts - Parts to compose into a key.
 * @returns Composed key string.
 */
export function composeKey(...parts: unknown[]): string {
  return JSON.stringify(parts);
}
