import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isObjectRecord, readObjectProperty } from './config/shared';
import { toHeavyRoutePathKey } from './heavy-route-path-key';

import type { RouteHandlerNextResult } from './types';

const ROUTE_HANDLER_LOOKUP_SNAPSHOT_VERSION = 1;
const DEFAULT_ROUTE_HANDLER_LOOKUP_SNAPSHOT_PATH = path.join(
  '.next',
  'cache',
  'route-handlers-lookup.json'
);

/**
 * Persisted heavy-route ownership for one configured target.
 */
export type PersistedRouteHandlerLookupTarget = {
  /**
   * Stable target identifier used to scope lookup data in multi-target apps.
   */
  targetId: string;

  /**
   * Encoded heavy-route membership keys for this target.
   *
   * Each entry is produced by `toHeavyRoutePathKey(locale, slugArray)` and
   * lets page-time lookup answer "is this localized path heavy?" without
   * rerunning route analysis.
   */
  heavyRoutePathKeys: Array<string>;
};

/**
 * Persisted page-time heavy-route lookup snapshot written by the adapter.
 */
export type PersistedRouteHandlerLookupSnapshot = {
  /**
   * Schema version for the persisted snapshot format.
   */
  version: number;

  /**
   * Whether `getStaticPaths` should actively exclude heavy routes from the
   * light catch-all page.
   *
   * `true` means rewrite/build mode needs an exact heavy/light split at
   * page-time. `false` means proxy development mode leaves cold ownership
   * discovery to request-time proxy routing instead.
   */
  filterHeavyRoutesInStaticPaths: boolean;

  /**
   * Per-target heavy-route ownership data used by page-time lookup.
   */
  targets: Array<PersistedRouteHandlerLookupTarget>;
};

const isPersistedRouteHandlerLookupTarget = (
  value: unknown
): value is PersistedRouteHandlerLookupTarget => {
  if (!isObjectRecord(value)) {
    return false;
  }

  const targetId = readObjectProperty(value, 'targetId');
  const heavyRoutePathKeys = readObjectProperty(value, 'heavyRoutePathKeys');

  return (
    typeof targetId === 'string' &&
    targetId.length > 0 &&
    Array.isArray(heavyRoutePathKeys) &&
    heavyRoutePathKeys.every(entry => typeof entry === 'string')
  );
};

export const resolveRouteHandlerLookupSnapshotPath = (
  rootDir: string
): string => path.resolve(rootDir, DEFAULT_ROUTE_HANDLER_LOOKUP_SNAPSHOT_PATH);

export const createRouteHandlerLookupSnapshot = (
  filterHeavyRoutesInStaticPaths: boolean,
  results: Array<RouteHandlerNextResult>
): PersistedRouteHandlerLookupSnapshot => {
  const heavyRoutePathKeysByTargetId = new Map<string, Set<string>>();

  for (const result of results) {
    if (!heavyRoutePathKeysByTargetId.has(result.targetId)) {
      heavyRoutePathKeysByTargetId.set(result.targetId, new Set());
    }

    for (const heavyRoute of result.heavyPaths) {
      heavyRoutePathKeysByTargetId
        .get(result.targetId)!
        .add(toHeavyRoutePathKey(heavyRoute.locale, heavyRoute.slugArray));
    }
  }

  return {
    version: ROUTE_HANDLER_LOOKUP_SNAPSHOT_VERSION,
    filterHeavyRoutesInStaticPaths,
    targets: Array.from(heavyRoutePathKeysByTargetId.entries())
      .sort(([leftTargetId], [rightTargetId]) =>
        leftTargetId.localeCompare(rightTargetId)
      )
      .map(([targetId, heavyRoutePathKeys]) => ({
        targetId,
        heavyRoutePathKeys: [...heavyRoutePathKeys].sort((left, right) =>
          left.localeCompare(right)
        )
      }))
  };
};

export const serializeRouteHandlerLookupSnapshot = (
  snapshot: PersistedRouteHandlerLookupSnapshot
): string =>
  JSON.stringify(
    {
      version: ROUTE_HANDLER_LOOKUP_SNAPSHOT_VERSION,
      filterHeavyRoutesInStaticPaths: snapshot.filterHeavyRoutesInStaticPaths,
      targets: snapshot.targets.map(target => ({
        targetId: target.targetId,
        heavyRoutePathKeys: [...target.heavyRoutePathKeys]
      }))
    },
    null,
    2
  ) + '\n';

export const parseRouteHandlerLookupSnapshot = (
  raw: string
): PersistedRouteHandlerLookupSnapshot | null => {
  try {
    const parsed = JSON.parse(raw);

    if (!isObjectRecord(parsed)) {
      return null;
    }

    if (
      readObjectProperty(parsed, 'version') !==
        ROUTE_HANDLER_LOOKUP_SNAPSHOT_VERSION ||
      typeof readObjectProperty(parsed, 'filterHeavyRoutesInStaticPaths') !==
        'boolean'
    ) {
      return null;
    }

    const targets = readObjectProperty(parsed, 'targets');

    if (
      !Array.isArray(targets) ||
      !targets.every(isPersistedRouteHandlerLookupTarget)
    ) {
      return null;
    }

    return {
      version: ROUTE_HANDLER_LOOKUP_SNAPSHOT_VERSION,
      filterHeavyRoutesInStaticPaths: readObjectProperty(
        parsed,
        'filterHeavyRoutesInStaticPaths'
      ) as boolean,
      targets: targets.map(target => ({
        targetId: target.targetId,
        heavyRoutePathKeys: [...target.heavyRoutePathKeys]
      }))
    };
  } catch {
    return null;
  }
};

export const readRouteHandlerLookupSnapshot = async (
  rootDir: string
): Promise<PersistedRouteHandlerLookupSnapshot | null> => {
  const snapshotPath = resolveRouteHandlerLookupSnapshotPath(rootDir);

  try {
    return parseRouteHandlerLookupSnapshot(
      await readFile(snapshotPath, 'utf8')
    );
  } catch {
    return null;
  }
};

export const writeRouteHandlerLookupSnapshot = async (
  rootDir: string,
  snapshot: PersistedRouteHandlerLookupSnapshot
): Promise<void> => {
  const snapshotPath = resolveRouteHandlerLookupSnapshotPath(rootDir);

  await mkdir(path.dirname(snapshotPath), {
    recursive: true
  });
  await writeFile(
    snapshotPath,
    serializeRouteHandlerLookupSnapshot(snapshot),
    'utf8'
  );
};
