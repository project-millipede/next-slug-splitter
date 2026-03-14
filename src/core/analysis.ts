import { captureReferencedComponentNames } from './capture';
import {
  compareLocalizedRouteIdentity,
  sortStringArray,
  toHandlerId,
  toHandlerRelativePath
} from './discovery';

import type {
  HeavyRouteCandidate,
  LocalizedRoutePath,
  RegistrySnapshot
} from './types';

/**
 * Analyze localized route files and classify which ones require dedicated
 * generated handlers.
 *
 * @param input - Analysis input.
 * @returns The per-route analysis record set plus the filtered heavy routes.
 */
export const classifyHeavyRoutes = async ({
  routePaths,
  registry,
  includeLocaleInHandlerPath = true
}: {
  /**
   * Localized route files discovered for the target.
   */
  routePaths: Array<LocalizedRoutePath>;
  /**
   * Registry snapshot used to decide which referenced components are loadable.
   */
  registry: RegistrySnapshot;
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
    // Capture returns every referenced component. The registry decides which
    // references actually promote a route into a generated handler candidate.
    const usedComponents = sortStringArray(
      await captureReferencedComponentNames({
        filePath: entry.filePath
      })
    );

    const usedLoadableComponentKeys = usedComponents.filter(componentName =>
      registry.loadableKeys.has(componentName)
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
      usedLoadableComponentKeys: sortStringArray(usedLoadableComponentKeys)
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
