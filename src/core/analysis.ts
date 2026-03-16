import { captureReferencedComponentNames } from './capture';
import {
  compareLocalizedRouteIdentity,
  sortStringArray,
  toHandlerId,
  toHandlerRelativePath
} from './discovery';

import type { HeavyRouteCandidate, LocalizedRoutePath } from './types';

/**
 * Analyze localized route files and classify which ones require dedicated
 * generated handlers.
 *
 * All captured components are treated as "loadable" - no separate allowlist filtering.
 *
 * @param input - Analysis input.
 * @returns The per-route analysis record set plus the filtered heavy routes.
 */
export const classifyHeavyRoutes = async ({
  routePaths,
  mdxCompileOptions,
  includeLocaleInHandlerPath = true
}: {
  /**
   * Localized route files discovered for the target.
   */
  routePaths: Array<LocalizedRoutePath>;
  /**
   * MDX compile plugins forwarded into the capture build.
   */
  mdxCompileOptions?: import('./types').RouteHandlerMdxCompileOptions;
  /**
   * Whether generated handler paths should keep the locale as a leaf segment.
   */
  includeLocaleInHandlerPath?: boolean;
}): Promise<{
  analysisRecords: Array<HeavyRouteCandidate>;
  heavyRoutes: Array<HeavyRouteCandidate>;
}> => {
  const heavyRoutes: Array<HeavyRouteCandidate> = [];
  const analysisRecords: Array<HeavyRouteCandidate> = [];

  for (const entry of routePaths) {
    // Capture returns every referenced component.
    // All components are treated as "loadable" (no separate allowlist filtering).
    const usedLoadableComponentKeys = sortStringArray(
      await captureReferencedComponentNames({
        filePath: entry.filePath,
        mdxCompileOptions
      })
    );

    const record: HeavyRouteCandidate = {
      locale: entry.locale,
      slugArray: entry.slugArray,
      handlerId: toHandlerId(entry.locale, entry.slugArray),
      handlerRelativePath: toHandlerRelativePath(
        entry.locale,
        entry.slugArray,
        {
          includeLocaleLeaf: includeLocaleInHandlerPath
        }
      ),
      usedLoadableComponentKeys
    };

    analysisRecords.push(record);

    if (record.usedLoadableComponentKeys.length > 0) {
      heavyRoutes.push(record);
    }
  }

  const sortedHeavyRoutes = heavyRoutes.sort(compareLocalizedRouteIdentity);

  return {
    analysisRecords,
    heavyRoutes: sortedHeavyRoutes
  };
};
