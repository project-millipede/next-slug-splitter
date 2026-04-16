import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { cloneLocaleConfig } from '../../core/locale-config';
import { isObjectRecord, readObjectProperty } from './config/shared';
import { toHeavyRoutePathKey } from './heavy-route-path-key';

import type { LocaleConfig } from '../../core/types';
import type { RouteHandlerNextResult } from './types';

const ROUTE_HANDLER_LOOKUP_SNAPSHOT_VERSION = 6;
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
   * Whether heavy-owned routes should be removed from the result returned by
   * the light route's static route hook.
   *
   * This flag is applied after user static route code runs:
   * - Pages Router: after `getStaticPaths`
   * - App Router: after `generateStaticParams`
   *
   * `true` means build/rewrite mode needs the light route result filtered so
   * heavy routes are served only by generated handlers.
   *
   * `false` means proxy development mode leaves cold heavy-route ownership to
   * request-time proxy routing instead.
   */
  filterHeavyRoutesFromStaticRouteResult: boolean;

  /**
   * Structural locale semantics captured for page-time heavy-route lookup.
   */
  localeConfig: LocaleConfig;

  /**
   * Per-target heavy-route ownership data used by page-time lookup.
   */
  targets: Array<PersistedRouteHandlerLookupTarget>;
};

/**
 * Validate one parsed target snapshot candidate.
 *
 * @param value Unknown parsed JSON value.
 * @returns `true` when the value matches the persisted target snapshot shape.
 */
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

/**
 * Clone one persisted target entry.
 *
 * @param target Target snapshot entry to copy.
 * @returns A defensive copy of the target snapshot entry.
 */
const clonePersistedRouteHandlerLookupTarget = (
  target: PersistedRouteHandlerLookupTarget
): PersistedRouteHandlerLookupTarget => ({
  targetId: target.targetId,
  heavyRoutePathKeys: [...target.heavyRoutePathKeys]
});

/**
 * Resolve the on-disk lookup snapshot path for one app root.
 *
 * @param rootDir Application root directory.
 * @returns Absolute path to the lookup snapshot file.
 */
export const resolveRouteHandlerLookupSnapshotPath = (
  rootDir: string
): string => path.resolve(rootDir, DEFAULT_ROUTE_HANDLER_LOOKUP_SNAPSHOT_PATH);

/**
 * Create the persisted lookup snapshot written by adapter/bootstrap flows.
 *
 * @param filterHeavyRoutesFromStaticRouteResult Whether page-time static route
 * filtering should exclude heavy routes.
 * @param results Generated route-handler results grouped by target.
 * @param options Snapshot creation options.
 * @param options.localeConfig Structural locale semantics for page-time lookup.
 * @returns A normalized persisted lookup snapshot.
 */
export const createRouteHandlerLookupSnapshot = (
  filterHeavyRoutesFromStaticRouteResult: boolean,
  results: Array<RouteHandlerNextResult>,
  {
    localeConfig
  }: {
    /**
     * Structural locale semantics reused by page-time lookup helpers.
     */
    localeConfig: LocaleConfig;
  }
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
    filterHeavyRoutesFromStaticRouteResult,
    localeConfig: cloneLocaleConfig(localeConfig),
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

/**
 * Serialize the persisted lookup snapshot to JSON.
 *
 * @param snapshot Snapshot to serialize.
 * @returns Stable human-readable JSON written to disk.
 */
export const serializeRouteHandlerLookupSnapshot = (
  snapshot: PersistedRouteHandlerLookupSnapshot
): string =>
  JSON.stringify(
    {
      version: ROUTE_HANDLER_LOOKUP_SNAPSHOT_VERSION,
      filterHeavyRoutesFromStaticRouteResult:
        snapshot.filterHeavyRoutesFromStaticRouteResult,
      localeConfig: cloneLocaleConfig(snapshot.localeConfig),
      targets: snapshot.targets.map(clonePersistedRouteHandlerLookupTarget)
    },
    null,
    2
  ) + '\n';

/**
 * Parse and validate a persisted lookup snapshot.
 *
 * @param raw Raw JSON snapshot contents.
 * @returns The validated snapshot, or `null` when the payload is invalid.
 */
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
      typeof readObjectProperty(
        parsed,
        'filterHeavyRoutesFromStaticRouteResult'
      ) !== 'boolean'
    ) {
      return null;
    }

    const localeConfig = readObjectProperty(parsed, 'localeConfig');

    if (
      !isObjectRecord(localeConfig) ||
      !Array.isArray(readObjectProperty(localeConfig, 'locales')) ||
      !(
        readObjectProperty(localeConfig, 'locales') as Array<unknown>
      ).every(entry => typeof entry === 'string') ||
      typeof readObjectProperty(localeConfig, 'defaultLocale') !== 'string'
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

    // Arrays are cloned on the way out so callers cannot mutate cached parsed
    // structures shared across later reads in the same process.
    return {
      version: ROUTE_HANDLER_LOOKUP_SNAPSHOT_VERSION,
      filterHeavyRoutesFromStaticRouteResult: readObjectProperty(
        parsed,
        'filterHeavyRoutesFromStaticRouteResult'
      ) as boolean,
      localeConfig: cloneLocaleConfig({
        locales: [
          ...((readObjectProperty(localeConfig, 'locales') as Array<string>) ??
            [])
        ],
        defaultLocale: readObjectProperty(
          localeConfig,
          'defaultLocale'
        ) as string
      }),
      targets: targets.map(clonePersistedRouteHandlerLookupTarget)
    };
  } catch {
    return null;
  }
};

/**
 * Read the persisted lookup snapshot from disk.
 *
 * @param rootDir Application root directory.
 * @returns The parsed snapshot, or `null` when the file is missing or invalid.
 */
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

/**
 * Write the persisted lookup snapshot to disk.
 *
 * @param rootDir Application root directory.
 * @param snapshot Snapshot to write.
 * @returns A promise that settles after the snapshot file is updated.
 */
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
