/**
 * Route handler processor — TypeScript variant.
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
 * This file is compiled to JavaScript via a `prepare` step
 * (`tsconfig.processor.json`) before the pipeline loads it at runtime.
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

type RuntimeTrait = 'selection' | 'wrapper';
type RuntimeTraits = ReadonlyArray<RuntimeTrait>;
type RuntimeConfig = {
  runtimeTraits?: RuntimeTraits;
};

const runtimeTrait = {
  selection: 'selection',
  wrapper: 'wrapper'
} as const;

const runtimeTraits = {
  selection: [runtimeTrait.selection],
  wrapper: [runtimeTrait.wrapper],
  wrapperAndSelection: [runtimeTrait.wrapper, runtimeTrait.selection]
} as const;

const metadataByKey: Readonly<
  Partial<Record<string, RuntimeConfig>>
> = {
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

export const routeHandlerProcessor = defineRouteHandlerProcessor<RuntimeConfig>({
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
