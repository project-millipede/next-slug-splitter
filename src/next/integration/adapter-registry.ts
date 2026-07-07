import type { NextAdapter } from 'next';

const SLUG_SPLITTER_NEXT_ADAPTER_SYMBOL = Symbol.for(
  'next-slug-splitter/next/adapter'
);

/**
 * Global registry for passing an optional user adapter to the installed
 * slug-splitter adapter path.
 */
type NextAdapterRegistry = {
  /**
   * User-provided adapter object registered by `withSlugSplitter(...)`.
   */
  adapter?: NextAdapter;
};

/**
 * Get the process-local registry used to pass an adapter object from
 * `next.config.*` evaluation to the adapter module.
 *
 * The storage mechanism reflects two constraints:
 *
 * 1. Function-Bearing Payload
 *    Adapter objects carry hook functions, so the environment-variable
 *    registration used for config paths in `slug-splitter-config.ts` cannot
 *    carry them: only in-process object storage can.
 *    Example:
 *     `adapter.modifyConfig` survives as a callable, not a serialized string.
 *
 * 2. Cross-Instance Survival
 *    `next.config.*` evaluation and the installed adapter entry may load this
 *    package through separate module instances. A `Symbol.for(...)` key on
 *    `globalThis` resolves to the same registry from every instance, where a
 *    module-level variable would not.
 *    Example:
 *     A bundled `withSlugSplitter` copy and the `adapterPath` module read the
 *     same registry object.
 *
 * @returns Mutable global registry object shared within the current process.
 */
const getNextAdapterRegistry = (): NextAdapterRegistry => {
  const globalScope = globalThis as typeof globalThis & {
    [SLUG_SPLITTER_NEXT_ADAPTER_SYMBOL]?: NextAdapterRegistry;
  };

  const existingRegistry = globalScope[SLUG_SPLITTER_NEXT_ADAPTER_SYMBOL];
  if (existingRegistry) {
    return existingRegistry;
  }

  const registry: NextAdapterRegistry = {};
  globalScope[SLUG_SPLITTER_NEXT_ADAPTER_SYMBOL] = registry;
  return registry;
};

/**
 * Read the user adapter registered for the current adapter process.
 *
 * @returns Registered user adapter, or `undefined` when none was provided.
 */
export const readRegisteredNextAdapter = (): NextAdapter | undefined =>
  getNextAdapterRegistry().adapter;

/**
 * Clear the user adapter registered for the current process.
 *
 * @returns Nothing; subsequent reads resolve to `undefined`.
 */
export const clearRegisteredNextAdapter = (): void => {
  delete getNextAdapterRegistry().adapter;
};

/**
 * Register a user adapter object for later composition with slug-splitter.
 *
 * Registration runs during `next.config.*` evaluation, strictly before Next
 * reads the installed adapter's hooks in the same process.
 *
 * @param adapter - User-provided Next adapter object.
 * @returns The same adapter object after registration.
 */
export const registerNextAdapter = (adapter: NextAdapter): NextAdapter => {
  getNextAdapterRegistry().adapter = adapter;
  return adapter;
};
