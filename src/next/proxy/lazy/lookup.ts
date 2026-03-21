import { toHeavyRoutePathKey } from '../../heavy-route-path-key';
import { readPersistedRouteHandlerLazyDiscoverySnapshotEntries } from './discovery-snapshot-store';

/**
 * Read persisted lazy-discovery heavy-route keys for one target.
 *
 * @param input - Snapshot lookup input.
 * @param input.rootDir - Application root directory.
 * @param input.targetId - Stable target identifier.
 * @returns Heavy-route lookup keys recovered from persisted lazy discoveries.
 *
 * @remarks
 * This helper gives page-time lookup a narrow, strategy-safe read view of the
 * lazy proxy subsystem:
 *
 * - it does not expose snapshot storage details to `lookup.ts`
 * - it does not validate or emit anything
 * - it simply projects already-persisted lazy discoveries into the same
 *   heavy-route key space used by page-time lookup
 *
 * That makes proxy-mode page lookup best-effort without reintroducing full
 * generation.
 */
export const readPersistedRouteHandlerLazyDiscoveryHeavyRoutePathKeys = async ({
  rootDir,
  targetId
}: {
  rootDir: string;
  targetId: string;
}): Promise<Set<string>> => {
  const snapshotEntries =
    await readPersistedRouteHandlerLazyDiscoverySnapshotEntries({
      rootDir
    });
  const heavyRoutePathKeys = new Set<string>();

  for (const snapshotEntry of snapshotEntries.values()) {
    if (snapshotEntry.targetId !== targetId) {
      continue;
    }

    heavyRoutePathKeys.add(
      toHeavyRoutePathKey(
        snapshotEntry.routePath.locale,
        snapshotEntry.routePath.slugArray
      )
    );
  }

  return heavyRoutePathKeys;
};
