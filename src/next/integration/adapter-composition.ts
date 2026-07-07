import type { NextAdapter } from 'next';

/**
 * Adapter identity shared by the installed entry and every composed adapter
 * it builds: composition is an implementation detail of the slug-splitter
 * adapter, and Next only reads the name of the installed entry module.
 */
export const SLUG_SPLITTER_ADAPTER_NAME = 'slug-splitter-adapter';

/**
 * Compose multiple Next adapters into one adapter object.
 *
 * Hook composition follows two rules:
 *
 * 1. Execution Semantics
 *    `modifyConfig` is a value pipeline: each adapter receives the config
 *    returned by the previous adapter. `onBuildComplete` is a side-effect
 *    sequence: each adapter sees the same build-complete context in the
 *    provided order.
 *    Example:
 *     composeNextAdapters(a, b) runs `modifyConfig` as a pipeline:
 *      config -> a.modifyConfig -> b.modifyConfig -> composed result
 *
 * 2. Presence-Accurate Hooks
 *    A hook is only defined on the composed adapter when at least one active
 *    adapter implements it. Next gates expensive work on hook presence —
 *    defining `onBuildComplete` makes every `next build` run the full adapter
 *    build-output collection — so hooks no adapter implements stay absent.
 *    Example:
 *     When no adapter implements `onBuildComplete`, the composed adapter
 *     leaves `onBuildComplete` undefined and Next skips output collection.
 *
 * @param adapters - Adapter objects to compose in execution order.
 * @returns A Next adapter that delegates supported hooks to every adapter.
 */
export const composeNextAdapters = (
  ...adapters: Array<NextAdapter | undefined>
): NextAdapter => {
  const activeAdapters = adapters.filter(
    (adapter): adapter is NextAdapter => adapter != null
  );

  const composedAdapter: NextAdapter = {
    name: SLUG_SPLITTER_ADAPTER_NAME
  };

  if (activeAdapters.some(adapter => adapter.modifyConfig != null)) {
    composedAdapter.modifyConfig = async (config, context) => {
      let currentConfig = config;

      for (const adapter of activeAdapters) {
        if (adapter.modifyConfig == null) {
          continue;
        }

        currentConfig = await adapter.modifyConfig(currentConfig, context);
      }

      return currentConfig;
    };
  }

  if (activeAdapters.some(adapter => adapter.onBuildComplete != null)) {
    composedAdapter.onBuildComplete = async context => {
      for (const adapter of activeAdapters) {
        await adapter.onBuildComplete?.(context);
      }
    };
  }

  return composedAdapter;
};
