/**
 * Minimal route handler processor for the demo.
 *
 * The processor tells next-slug-splitter how to classify captured components
 * and which factory variant to use for each heavy route.
 *
 * Component imports are resolved through the component registry — a pure
 * metadata module that maps keys to individual file paths. This avoids
 * importing from a barrel which would pull in all components and their
 * ballast.
 *
 * In a full application (e.g. the millipede app), the processor is more
 * elaborate: it resolves per-component metadata, selects a factory variant
 * based on runtime traits (selection, wrapper, none), and attaches metadata
 * to each component entry. This demo uses a simplified version that always
 * selects the `none` factory variant.
 */

import path from 'node:path';

import {
  defineRouteHandlerProcessor,
  type ComponentImportSpec,
  type RouteHandlerGeneratorComponent,
  type RouteHandlerProcessor
} from 'next-slug-splitter/next';

import { componentRegistry, type ComponentRegistryEntry } from './component-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Resolved state returned by `ingress` and consumed by `egress`.
 *
 * Maps each captured component key to its registry entry, or `undefined`
 * when the key has no matching registry record.
 */
type ResolvedComponentMap = Readonly<
  Record<string, ComponentRegistryEntry | undefined>
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve each captured key against the component registry.
 *
 * Returns a map so `egress` can look up metadata per key without
 * repeating the registry lookup.
 */
const resolveComponentsByCapturedKey = (
  capturedKeys: readonly string[]
): ResolvedComponentMap => {
  const resolved: Record<string, ComponentRegistryEntry | undefined> = {};
  for (const key of capturedKeys) {
    resolved[key] = componentRegistry[key];
  }
  return resolved;
};

/**
 * Build a `ComponentImportSpec` from a registry entry.
 *
 * Resolves the relative `modulePath` to an absolute path so the code
 * generator emits correct import statements in the generated handler.
 */
const buildComponentImport = (entry: ComponentRegistryEntry): ComponentImportSpec => ({
  source: path.resolve(process.cwd(), entry.modulePath),
  kind: 'named',
  importedName: entry.exportName
});

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

export const routeHandlerProcessor: RouteHandlerProcessor<ResolvedComponentMap> =
  defineRouteHandlerProcessor({
    ingress({ capturedKeys }) {
      return resolveComponentsByCapturedKey(capturedKeys);
    },

    egress({ capturedKeys, resolved }) {
      const components: Array<RouteHandlerGeneratorComponent> = [];

      for (const key of capturedKeys) {
        const entry = resolved[key];
        if (entry) {
          components.push({
            key,
            componentImport: buildComponentImport(entry)
          });
        } else {
          components.push({ key });
        }
      }

      return {
        factoryVariant: 'none',
        components
      };
    }
  });
