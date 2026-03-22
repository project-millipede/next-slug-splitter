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
import { componentRegistry } from './component-registry.mjs';

// ---------------------------------------------------------------------------
// Types (JSDoc only — see the TypeScript variant for native type definitions)
// ---------------------------------------------------------------------------

/**
 * Resolved state returned by `ingress` and consumed by `egress`.
 *
 * Maps each captured component key to its registry entry, or `undefined`
 * when the key has no matching registry record.
 *
 * @typedef {Readonly<Record<string, import('./component-registry.mjs').ComponentRegistryEntry | undefined>>} ResolvedComponentMap
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve each captured key against the component registry.
 *
 * Returns a map so `egress` can look up metadata per key without
 * repeating the registry lookup.
 *
 * @param {readonly string[]} capturedKeys
 * @returns {ResolvedComponentMap}
 */
const resolveComponentsByCapturedKey = (capturedKeys) => {
  const resolved = {};
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
 *
 * @param {import('./component-registry.mjs').ComponentRegistryEntry} entry
 * @returns {import('next-slug-splitter/next').ComponentImportSpec}
 */
const buildComponentImport = (entry) => ({
  source: path.resolve(process.cwd(), entry.modulePath),
  kind: 'named',
  importedName: entry.exportName
});

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

/**
 * The exported processor implements the `RouteHandlerProcessor` contract.
 *
 * - `ingress` — resolves captured keys against the component registry,
 *   producing a `ResolvedComponentMap` that is passed to `egress`.
 * - `egress`  — maps the resolved entries into a generation plan with
 *   concrete component import specs and the `none` factory variant.
 *
 * @type {import('next-slug-splitter/next').RouteHandlerProcessor<ResolvedComponentMap>}
 */
export const routeHandlerProcessor = {
  ingress({ capturedKeys }) {
    return resolveComponentsByCapturedKey(capturedKeys);
  },

  egress({ capturedKeys, resolved }) {
    /** @type {Array<import('next-slug-splitter/next').RouteHandlerGeneratorComponent>} */
    const components = [];

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
};
