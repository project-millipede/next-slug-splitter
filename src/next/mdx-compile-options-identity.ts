import type { RouteHandlerMdxCompileOptions } from '../core/types';
import { toCanonicalJson } from '../utils/json-serializer';

/**
 * Generates a stable, deterministic cache identity string for MDX options.
 *
 * @param options - The MDX compile options used during route analysis.
 * @returns A deterministic JSON string for cache invalidation.
 */
export const createMdxCompileOptionsIdentity = (
  options: RouteHandlerMdxCompileOptions
): string => {
  return JSON.stringify(
    toCanonicalJson({
      remarkPlugins: options.remarkPlugins ?? [],
      recmaPlugins: options.recmaPlugins ?? []
    })
  );
};
