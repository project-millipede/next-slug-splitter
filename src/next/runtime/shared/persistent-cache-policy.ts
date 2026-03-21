import type { PipelineMode } from '../../../core/types';

/**
 * Shared persistent-cache execution policy.
 *
 * @remarks
 * This module documents one very specific cache group in the current design:
 * the shared runtime cache record stored at `.next/cache/route-handlers.json`.
 *
 * That record exists for two reasons:
 * - it gives runtime lookup code one merged artifact to read without having to
 *   re-run target planning
 * - it preserves the established runtime contract where a single Next-side
 *   cache file describes the merged heavy-route state
 *
 * The important subtlety is that "shared persistent cache exists" and
 * "shared persistent cache may skip execution" are not the same decision.
 * After incremental planning and selective emission were introduced, generate
 * mode still has work to do on a cache hit:
 * - the target-local per-file cache may need to verify or reuse planned routes
 * - the handler emission layer may need to confirm generated files are present
 *   and synchronized with the latest heavy-route set
 *
 * This policy layer makes that distinction explicit. It allows the shared
 * cache to remain the persisted artifact while preventing it from short-
 * circuiting target execution in modes where that would skip correctness work.
 */
export type PersistentCacheExecutionPolicy = {
  /**
   * Whether a matching shared cache record may be read before target
   * execution and returned immediately.
   */
  readResultBeforeTargetExecution: boolean;

  /**
   * Whether the merged runtime result should be written back to the shared
   * cache after target execution finishes.
   */
  writeResultAfterTargetExecution: boolean;
};

/**
 * Resolve how the shared persistent cache participates in one runtime mode.
 *
 * @remarks
 * Think of this function as the "traffic rule" for the shared cache group.
 * Consumer-facing runtime entrypoints do not hardcode cache behavior inline;
 * they ask this policy module whether the shared cache may:
 * - answer a request before target execution begins
 * - or only be refreshed after target execution completes
 *
 * @param input - Runtime mode input.
 * @returns Shared persistent-cache execution policy for the mode.
 */
export const resolvePersistentCacheExecutionPolicy = ({
  mode
}: {
  mode: PipelineMode;
}): PersistentCacheExecutionPolicy => {
  if (mode === 'generate') {
    return {
      readResultBeforeTargetExecution: false,
      writeResultAfterTargetExecution: true
    };
  }

  return {
    readResultBeforeTargetExecution: false,
    writeResultAfterTargetExecution: false
  };
};
