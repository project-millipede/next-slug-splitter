import process from 'node:process';

import { cloneLocaleConfig } from '../../core/locale-config';
import {
  createConfigMissingError,
  createLookupError
} from '../../utils/errors';
import {
  readAppRouteLookupSnapshot,
  type PersistedAppRouteLookupSnapshot
} from './lookup-persisted';
import {
  createHeavyRouteLookupFromSnapshot,
  readRequiredRouteHandlerLookupSnapshot
} from '../shared/heavy-route-lookup';
import type { PersistedRouteHandlerLookupSnapshot } from '../shared/lookup-persisted';
import {
  filterStaticParamsAgainstHeavyRoutes
} from './filter-static-params';

import type {
  AppRouteGenerateStaticParams,
  AppRouteStaticParams,
  AppRouteStaticParamValue,
  FilterStaticParamsAgainstHeavyRoutesOptions
} from './filter-static-params';

export type {
  AppRouteGenerateStaticParams,
  AppRouteStaticParams,
  AppRouteStaticParamValue,
  FilterStaticParamsAgainstHeavyRoutesOptions
} from './filter-static-params';

export type WithHeavyRouteStaticParamsFilterOptions<
  TArgs extends Array<unknown> = [],
  TParams extends AppRouteStaticParams = AppRouteStaticParams
> = {
  /**
   * Target identifier for cache lookup scoping.
   */
  targetId: string;
  /**
   * User-owned `generateStaticParams` implementation.
   */
  generateStaticParams: AppRouteGenerateStaticParams<TArgs, TParams>;
};

/**
 * Re-export the pure App static-params filtering helper from the public App
 * static-params entrypoint.
 */
export { filterStaticParamsAgainstHeavyRoutes };

/**
 * Create a `generateStaticParams` function that automatically filters heavy
 * routes from the light App Router catch-all path.
 *
 * @param options - Wrapper configuration.
 * @returns An async function matching the wrapped static-params contract.
 */
export const withHeavyRouteStaticParamsFilter = <
  TArgs extends Array<unknown>,
  TParams extends AppRouteStaticParams
>({
  targetId,
  generateStaticParams
}: WithHeavyRouteStaticParamsFilterOptions<
  TArgs,
  TParams
>): AppRouteGenerateStaticParams<TArgs, TParams> => {
  let snapshotPromise: Promise<PersistedRouteHandlerLookupSnapshot> | undefined;
  let appSnapshotPromise:
    | Promise<PersistedAppRouteLookupSnapshot | null>
    | undefined;

  const getSnapshot = () => {
    if (snapshotPromise == null) {
      snapshotPromise = readRequiredRouteHandlerLookupSnapshot(targetId);
    }

    return snapshotPromise;
  };

  const getAppSnapshot = () => {
    if (appSnapshotPromise == null) {
      appSnapshotPromise = readAppRouteLookupSnapshot(process.cwd());
    }

    return appSnapshotPromise;
  };

  return async (...args: TArgs) => {
    const result = await generateStaticParams(...args);
    const snapshot = await getSnapshot();

    if (!snapshot.filterHeavyRoutesFromStaticRouteResult) {
      return result;
    }

    const appSnapshot = await getAppSnapshot();

    if (appSnapshot == null) {
      throw createConfigMissingError(
        'Missing App Router lookup snapshot. Page-time App metadata requires a bootstrap-generated `.next/cache/route-handlers-app-lookup.json` snapshot.',
        { targetId }
      );
    }

    const appTargetSnapshot = appSnapshot.targets.find(
      target => target.targetId === targetId
    );

    if (appTargetSnapshot == null) {
      throw createLookupError(`Unknown targetId "${targetId}".`, { targetId });
    }

    const heavyRouteLookup = createHeavyRouteLookupFromSnapshot(
      targetId,
      snapshot
    );

    return await filterStaticParamsAgainstHeavyRoutes(
      result,
      heavyRouteLookup.isHeavyRoute,
      {
        handlerRouteParamName: appTargetSnapshot.handlerRouteParamName,
        localeConfig: cloneLocaleConfig(snapshot.localeConfig)
      }
    );
  };
};
