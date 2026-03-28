# Worker Bootstrap Manifest TODO

This note breaks down the work required to eliminate path-based worker/bootstrap
reload and eventually re-evaluate whether `withSlugSplitter({ configPath })`
is still needed.

The goal is not to serialize the raw `routeHandlersConfig` object. The goal is
to replace worker-side config reloading with a narrow, versioned, bootstrap-
owned manifest that contains only the derived data the proxy worker actually
needs.

## Current Problem

Today the long-lived proxy worker still bootstraps by loading the app-owned
config object:

- `src/next/proxy/worker/bootstrap.ts`
- `src/next/internal/route-handlers-bootstrap.ts`
- `src/next/integration/slug-splitter-config-loader.ts`

That means:

1. `withSlugSplitter({ routeHandlersConfig })` is enough for same-process use,
   but it does not preserve source-module provenance.
2. Cross-process worker bootstrap still benefits from `configPath`.
3. Direct-object integrations fall back to a conventional filename heuristic in
   `src/next/integration/slug-splitter-config.ts`.

That heuristic is currently:

- explicit `configPath` when known
- otherwise one of the conventional root-level filenames such as
  `route-handlers-config.ts`

This is a useful bridge, but it is not the desired long-term contract.

## Why We Cannot Just Serialize `routeHandlersConfig`

The fully resolved config is not a clean cross-process artifact today.

Relevant types:

- `src/next/types.ts`
- `src/core/types.ts`

Important blockers:

1. `ResolvedRouteHandlersConfig` still carries `mdxCompileOptions`.
2. `RouteHandlerMdxCompileOptions` currently uses `PluggableList`.
3. `PluggableList` can contain live plugin functions and non-serializable
   values.
4. Worker bootstrap still depends on processor configuration that eventually
   leads to runtime module loading.

So the right boundary is:

- not raw config object persistence
- not path guessing forever
- but a dedicated worker-bootstrap manifest with serializable derived values

## Target State

The desired proxy bootstrap flow is:

1. `withSlugSplitter(...)` and the adapter/bootstrap path resolve app config.
2. bootstrap owns `prepare`
3. bootstrap writes a dedicated worker-bootstrap manifest under `.next/cache`
4. the proxy worker reads only that manifest plus the already-persisted
   runtime semantics and lookup snapshots
5. worker lazy misses use the bootstrapped value state and never reload the
   source config module

At that point:

- `resolveRegisteredSlugSplitterConfigRegistration(...)` no longer needs the
  conventional filename heuristic for worker bootstrap
- `configPath` can be re-evaluated from a cleaner position

## Non-Goals

This refactor should not:

1. reintroduce TTL caches or app-owned identity caches
2. serialize raw plugin functions
3. move page-time lookup back to raw config loading
4. couple worker bootstrap to user-defined file watching
5. remove `configPath` before the worker no longer depends on source-module
   provenance

## Phase 1: Inventory the True Worker Inputs

Goal:

- identify exactly which values the worker needs after bootstrap and which of
  those are currently non-serializable

Main files to inspect:

- `src/next/proxy/worker/bootstrap.ts`
- `src/next/proxy/lazy/request-resolution.ts`
- `src/next/proxy/lazy/single-route-analysis.ts`
- `src/next/proxy/worker/resolve-lazy-miss.ts`
- `src/next/types.ts`
- `src/core/types.ts`

Tasks:

1. write down the exact fields the worker consumes from:
   - app config
   - resolved target configs
   - processor config
   - locale config
2. classify each field as:
   - serializable as-is
   - derivable later from a module reference
   - not suitable for manifest persistence
3. produce a short matrix in this note or a follow-up note showing:
   - field
   - current source
   - consumer
   - serialization status

Exit criteria:

- there is a complete list of worker bootstrap dependencies
- the team agrees on which dependencies must stay runtime-loaded and which can
  become manifest fields

## Phase 2: Introduce an MDX-Preset Boundary

Goal:

- remove live plugin functions from the worker-bootstrap contract

Why this phase exists:

- `mdxCompileOptions` is the largest blocker to a stable serialized manifest

Possible direction:

- replace or complement raw `mdxCompileOptions` with an import-based preset
  reference

Candidate shape:

```ts
type RouteHandlerMdxPresetReference = {
  source: ModuleReference;
  exportedName?: string;
};
```

Then bootstrap can either:

1. resolve the preset to a normalized import reference stored in the manifest,
   or
2. store only a serializable preset descriptor and let the worker load it at a
   much narrower boundary than the full config module

Tasks:

1. design the public/internal replacement for raw plugin lists
2. keep backward compatibility temporarily if needed
3. add normalization and validation for the new preset reference
4. update the MDX analysis path to consume the new resolved preset contract

Main files likely touched:

- `src/core/types.ts`
- `src/next/types.ts`
- `src/next/config/resolve-target.ts`
- `src/core/processor-runner.ts`
- MDX compile/capture helpers that currently consume `mdxCompileOptions`

Exit criteria:

- worker bootstrap no longer needs raw `PluggableList` values
- MDX-related planning inputs are serializable or narrow import references

## Phase 3: Define the Worker Bootstrap Manifest

Goal:

- create a dedicated persisted artifact for worker bootstrap

Candidate file:

- `.next/cache/route-handlers-worker-bootstrap.json`

Candidate shape:

```ts
type PersistedRouteHandlerWorkerBootstrap = {
  version: 1;
  bootstrapGenerationToken: string;
  rootDir: string;
  localeConfig: {
    locales: Array<string>;
    defaultLocale: string;
  };
  targets: Array<{
    targetId: string;
    routeBasePath: string;
    contentLocaleMode: string;
    emitFormat: string;
    paths: {
      rootDir: string;
      contentPagesDir: string;
      handlersDir: string;
    };
    processorConfig: {
      processorImport: ResolvedModuleReference;
    };
    baseStaticPropsImport: ResolvedModuleReference;
    handlerRouteParam: DynamicRouteParam;
    mdxPreset?: ResolvedModuleReference;
  }>;
  prepare: Array<{
    tsconfigPath: string;
  }>;
};
```

Notes:

1. This shape should contain only values the worker truly needs.
2. It should not contain raw `routeHandlersConfig`.
3. It should not contain any Next-derived semantics unrelated to worker
   bootstrap.
4. It should be versioned independently from:
   - `route-handlers-semantics.json`
   - `route-handlers-lookup.json`

Tasks:

1. create serializer/parser/read/write helpers
2. add tests for:
   - stable serialization
   - invalid version rejection
   - missing-field rejection
3. keep naming parallel to:
   - `src/next/runtime-semantics/persisted.ts`
   - `src/next/lookup-persisted.ts`

Exit criteria:

- the worker-bootstrap manifest exists as its own narrow persisted contract

## Phase 4: Write the Manifest from Bootstrap-Owned Code

Goal:

- make adapter/bootstrap produce the worker manifest so the worker does not
  need source-module provenance anymore

Main files likely touched:

- `src/next/adapter.ts`
- `src/next/proxy/runtime/bootstrap-state.ts`
- possibly `src/next/internal/route-handlers-bootstrap.ts`

Tasks:

1. resolve config once in the bootstrap/adapter layer
2. run `prepare` in the bootstrap/adapter layer
3. normalize the resolved target data into the worker-bootstrap manifest
4. persist the manifest under `.next/cache`
5. tie manifest freshness to `bootstrapGenerationToken`

Important constraint:

- this must preserve the current separation:
  - Next runtime semantics remain in `route-handlers-semantics.json`
  - page-time lookup remains in `route-handlers-lookup.json`
  - worker bootstrap gets its own dedicated manifest

Exit criteria:

- bootstrap-owned code can fully materialize worker inputs without asking the
  worker to load config itself

## Phase 5: Switch the Worker to Manifest-Only Bootstrap

Goal:

- remove raw config loading from the worker bootstrap path

Main files likely touched:

- `src/next/proxy/worker/bootstrap.ts`
- `src/next/proxy/worker/entry.ts`
- `src/next/proxy/runtime/bootstrap-state.ts`

Tasks:

1. change `bootstrapRouteHandlerProxyWorker(...)` to read the persisted worker
   manifest
2. remove `loadRouteHandlersConfigOrRegistered()` from the worker bootstrap
   path
3. remove `prepareRouteHandlersFromConfig(...)` from the worker bootstrap path
4. keep the worker bootstrap result as the in-memory session value object it is
   today

Acceptance tests:

1. worker bootstraps successfully with no access to the config loader
2. worker lazy misses still resolve:
   - no-target
   - light route
   - heavy route
   - stale output cleanup
   - cached one-file plan reuse
3. deleting a handler file still triggers re-emission on demand

Exit criteria:

- the worker no longer reads or reloads the source config module

## Phase 6: Remove the Config-Path Guessing Bridge

Goal:

- eliminate the conventional root-level filename fallback once the worker no
  longer needs it

Main file:

- `src/next/integration/slug-splitter-config.ts`

Tasks:

1. delete `SLUG_SPLITTER_CONVENTIONAL_CONFIG_FILE_NAMES`
2. simplify `resolveRegisteredSlugSplitterConfigRegistration(...)`
3. update comments/docs that currently describe direct-object fallback guessing
4. update tests that rely on guessed root-level config discovery for the worker

Exit criteria:

- direct-object registration no longer relies on path guessing for worker
  bootstrap

## Phase 7: Re-evaluate `configPath`

Only after Phase 6 should the team decide whether `configPath` is still needed.

Questions to answer then:

1. Does any remaining flow still require explicit source-module provenance?
2. Is `configPath` still valuable as a user-facing clarity/ergonomics feature?
3. Do we want to keep both modes because they describe two distinct user
   intents?

Possible outcomes:

1. keep both modes
2. de-emphasize `configPath` but keep it
3. deprecate `configPath`
4. remove `configPath`

This decision should not be made before worker bootstrap is manifest-based.

## Suggested Implementation Order

If this work is done incrementally, the safest order is:

1. Phase 1 inventory
2. Phase 2 MDX preset boundary
3. Phase 3 worker-bootstrap manifest types and persistence
4. Phase 4 adapter/bootstrap writes manifest
5. Phase 5 worker reads manifest only
6. Phase 6 remove path guessing
7. Phase 7 revisit `configPath`

## Quick Sanity Checklist for Each Phase

Before landing each phase, verify:

1. `pnpm typecheck`
2. targeted proxy worker tests
3. targeted lookup snapshot tests
4. at least one demo or app flow covering:
   - light route
   - heavy route
   - missing handler re-emission
   - dev restart or bootstrap refresh

## Decision Rule

Do not remove `configPath` while any worker/bootstrap path still depends on:

1. source-module provenance
2. reloading `routeHandlersConfig` from disk
3. the conventional root-level config filename heuristic

Only after all three are gone does a `routeHandlersConfig`-only world become a
clean design instead of a heuristic one.
