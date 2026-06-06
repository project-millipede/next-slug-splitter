/**
 * Route handler processor — JavaScript variant.
 *
 * The processor tells next-slug-splitter how to resolve captured components
 * and which factory import to use for each heavy App Router handler page.
 *
 * Loadable component imports reference the `@demo/components` workspace package
 * directly. Captured keys outside the app-owned loadable key set remain in the
 * MDX component scope, so this variant only resolves generated handler imports
 * for keys that should cross the loadable package boundary.
 * lookup helper.
 *
 * This variant demonstrates inline per-entry metadata. The processor keeps a
 * small keyed metadata map locally and attaches the matching JSON metadata
 * object to each returned component entry.
 *
 * The demo uses one small runtime-aware factory that reads the emitted
 * metadata at render time. This keeps the runtime-trait example visible
 * without introducing a separate app-specific runtime split into the demo.
 *
 * This file already runs as JavaScript, so the pipeline can load it at
 * runtime without a prepare step.
 */

import {
  defineRouteHandlerProcessor,
  packageModule,
  relativeModule
} from 'next-slug-splitter/next';

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

// Shared package boundary reused for every generated component import.
const componentsModule = packageModule('@demo/components');

/**
 * @typedef {'selection' | 'wrapper'} RuntimeTrait
 * One supported runtime trait key in the JavaScript demo variant.
 */

/**
 * @typedef {ReadonlyArray<RuntimeTrait>} RuntimeTraits
 * Ordered list of runtime traits attached to one component entry.
 */

/**
 * @typedef {{ runtimeTraits?: RuntimeTraits }} RuntimeConfig
 * Optional runtime metadata emitted into generated handler entries.
 */

/** @type {{ selection: RuntimeTrait, wrapper: RuntimeTrait }} */
const runtimeTrait = {
  selection: 'selection',
  wrapper: 'wrapper'
};

/** @type {{ selection: RuntimeTraits, wrapper: RuntimeTraits, wrapperAndSelection: RuntimeTraits }} */
const runtimeTraits = {
  selection: [runtimeTrait.selection],
  wrapper: [runtimeTrait.wrapper],
  wrapperAndSelection: [runtimeTrait.wrapper, runtimeTrait.selection]
};

/** @type {Readonly<Partial<Record<string, RuntimeConfig>>>} */
const metadataByKey = {
  Chart: {
    runtimeTraits: runtimeTraits.wrapper
  },
  Counter: {
    runtimeTraits: runtimeTraits.wrapperAndSelection
  },
  DataTable: {
    runtimeTraits: runtimeTraits.selection
  }
};

const loadableComponentKeySet = new Set(Object.keys(metadataByKey));

/**
 * Determine whether one captured component key should be emitted as loadable.
 *
 * @param {string} key Captured component key being evaluated.
 * @returns {boolean} `true` when the key should become a generated handler import.
 */
const shouldEmitLoadableComponent = key => loadableComponentKeySet.has(key);

/**
 * The exported processor implements the `RouteHandlerProcessor` contract.
 *
 * Captured keys are filtered through `loadableComponentKeySet`. Omitted keys
 * remain in the MDX component scope and are not emitted into generated handlers.
 *
 * @type {import('next-slug-splitter/next').RouteHandlerProcessor<RuntimeConfig>}
 */
export const routeHandlerProcessor = defineRouteHandlerProcessor({
  resolve({ capturedComponentKeys }) {
    const loadableComponentKeys = capturedComponentKeys.filter(
      shouldEmitLoadableComponent
    );

    return {
      factoryImport: relativeModule('lib/handler-factory/runtime'),
      components: loadableComponentKeys.map(key => ({
        key,
        componentImport: {
          source: componentsModule,
          kind: 'named',
          importedName: key
        },
        ...(metadataByKey[key] == null ? {} : { metadata: metadataByKey[key] })
      }))
    };
  }
});
