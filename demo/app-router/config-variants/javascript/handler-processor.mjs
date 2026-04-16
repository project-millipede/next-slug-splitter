/**
 * Route handler processor — JavaScript variant.
 *
 * The processor tells next-slug-splitter how to resolve captured components
 * and which factory import to use for each heavy App Router handler page.
 *
 * Component imports reference the `@demo/components` workspace package
 * directly. Each captured component key already maps to a named export from
 * that package boundary, so this variant does not need a local module-map
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

/**
 * The exported processor implements the `RouteHandlerProcessor` contract.
 *
 * Each captured key already matches a named export from
 * `@demo/components`, so `resolve` can return the final generation plan
 * directly without a module-map lookup step.
 *
 * @type {import('next-slug-splitter/next').RouteHandlerProcessor<RuntimeConfig>}
 */
export const routeHandlerProcessor = defineRouteHandlerProcessor({
  resolve({ capturedComponentKeys }) {
    return {
      factoryImport: relativeModule('lib/handler-factory/runtime'),
      components: capturedComponentKeys.map(key => ({
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
