/**
 * Route handler processor — TypeScript variant.
 *
 * The processor tells next-slug-splitter how to resolve captured components
 * and which factory import to use for each heavy App Router handler page.
 *
 * Loadable component imports reference the shared `@next-slug-splitter/ballast-kit` package
 * boundary. Captured keys outside the app-owned loadable key set remain in the
 * MDX component scope, so this variant only resolves generated handler imports
 * for keys that should cross that package boundary.
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
const componentsModule = packageModule('@next-slug-splitter/ballast-kit');

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

const metadataByKey: Readonly<Partial<Record<string, RuntimeConfig>>> = {
  FlowComposer: {
    runtimeTraits: runtimeTraits.wrapper
  },
  ExamplePreview: {
    runtimeTraits: runtimeTraits.wrapperAndSelection
  },
  ComponentWorkbench: {
    runtimeTraits: runtimeTraits.selection
  }
};

const loadableComponentKeySet = new Set(Object.keys(metadataByKey));

/**
 * Determine whether one captured component key should be emitted as loadable.
 *
 * @param key - Captured component key being evaluated.
 * @returns `true` when the key should become a generated handler import.
 */
const shouldEmitLoadableComponent = (key: string): boolean =>
  loadableComponentKeySet.has(key);

/**
 * The exported processor implements the `RouteHandlerProcessor` contract.
 *
 * Captured keys are filtered through `loadableComponentKeySet`. Omitted keys
 * remain in the MDX component scope and are not emitted into generated handlers.
 */
export const routeHandlerProcessor = defineRouteHandlerProcessor<RuntimeConfig>(
  {
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
          ...(metadataByKey[key] == null
            ? {}
            : { metadata: metadataByKey[key] })
        }))
      };
    }
  }
);
