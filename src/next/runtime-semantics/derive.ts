import { resolveLocaleConfig } from '../config/locale';

import type { NextConfigLike } from '../config/load-next-config';
import type { RouteHandlerRuntimeSemantics } from '../types';

/**
 * Extract the Next-derived semantics currently required by the library.
 *
 * @param nextConfig - Resolved Next config object.
 * @returns Derived runtime semantics snapshot payload.
 */
export const deriveRouteHandlerRuntimeSemantics = (
  nextConfig: NextConfigLike
): RouteHandlerRuntimeSemantics => ({
  localeConfig: resolveLocaleConfig(nextConfig)
});
