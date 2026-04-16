import process from 'node:process';

import { createConfigMissingError, createLookupError } from '../../utils/errors';
import { toHeavyRoutePathKey } from './heavy-route-path-key';
import {
  readRouteHandlerLookupSnapshot,
  type PersistedRouteHandlerLookupSnapshot
} from './lookup-persisted';

import type { RouteHandlerHeavyRouteLookup } from './types';

const createMissingRouteHandlerLookupSnapshotError = (targetId?: string) =>
  createConfigMissingError(
    'Missing route-handler lookup snapshot. Heavy-route filtering requires a bootstrap-generated `.next/cache/route-handlers-lookup.json` snapshot.',
    targetId == null ? undefined : { targetId }
  );

/**
 * Read the persisted lookup snapshot or fail with a targeted configuration
 * error when it is missing.
 *
 * @param targetId Optional target identifier used only for richer errors.
 * @returns The persisted route-handler lookup snapshot.
 */
export const readRequiredRouteHandlerLookupSnapshot = async (
  targetId?: string
): Promise<PersistedRouteHandlerLookupSnapshot> => {
  const snapshot = await readRouteHandlerLookupSnapshot(process.cwd());

  if (snapshot == null) {
    throw createMissingRouteHandlerLookupSnapshotError(targetId);
  }

  return snapshot;
};

/**
 * Build a lightweight heavy-route lookup from already encoded path keys.
 *
 * @param targetId Stable target identifier for diagnostics.
 * @param heavyRoutePathKeys Encoded `locale + slug` lookup keys.
 * @returns A lookup object that answers heavy-route membership checks.
 */
export const createHeavyRouteLookupFromPathKeys = (
  targetId: string,
  heavyRoutePathKeys: ReadonlySet<string>
): RouteHandlerHeavyRouteLookup => ({
  targetId,
  heavyRoutePathKeys,
  isHeavyRoute: (locale, slugArray) =>
    heavyRoutePathKeys.has(toHeavyRoutePathKey(locale, slugArray))
});

/**
 * Read one target snapshot from the persisted lookup document.
 *
 * @param targetId Stable target identifier to locate.
 * @param snapshot Persisted lookup snapshot.
 * @returns The matching target snapshot.
 */
const readRequiredRouteHandlerLookupTargetSnapshot = (
  targetId: string,
  snapshot: PersistedRouteHandlerLookupSnapshot
) => {
  const targetSnapshot = snapshot.targets.find(
    target => target.targetId === targetId
  );

  if (targetSnapshot == null) {
    throw createLookupError(`Unknown targetId "${targetId}".`, { targetId });
  }

  return targetSnapshot;
};

/**
 * Build a heavy-route lookup from the persisted snapshot.
 *
 * @param targetId Stable target identifier to load.
 * @param snapshot Persisted lookup snapshot.
 * @returns A heavy-route lookup derived from the target snapshot.
 */
export const createHeavyRouteLookupFromSnapshot = (
  targetId: string,
  snapshot: PersistedRouteHandlerLookupSnapshot
): RouteHandlerHeavyRouteLookup => {
  const targetSnapshot = readRequiredRouteHandlerLookupTargetSnapshot(
    targetId,
    snapshot
  );

  return createHeavyRouteLookupFromPathKeys(
    targetId,
    new Set(targetSnapshot.heavyRoutePathKeys)
  );
};
