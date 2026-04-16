# Cache Policy

This note summarizes the current cache and reuse policy for the Next
integration.

The main goals are:

- keep persisted reuse only where the library owns a stable artifact
- keep long-lived process reuse explicit and generation-scoped
- keep in-flight dedupe narrow and tied to one concrete work unit
- avoid warm semantic caches keyed by time or app-owned identity hooks

## Current Layers

### Persisted bootstrap-owned lookup snapshot

The route-handler integration persists a page-time lookup snapshot in:

- `src/next/shared/lookup-persisted.ts`

This snapshot stores only the stable lookup data needed after adapter-time
generation:

- whether page-time heavy-route filtering is enabled
- target ids
- heavy-route path keys per target
- App target metadata needed for page-time filtering and page-data compilation:
  - derived `handlerRouteParam.name`
  - `pageDataCompilerModulePath`

It does not store:

- raw `routeHandlersConfig`
- `processorConfig`
- runtime attachments
- app-owned plugin or function values

Its purpose is narrow:

- Pages Router `getStaticPaths` filtering
- App Router `generateStaticParams` filtering
- page-time heavy-route lookup without rerunning analysis
- page-time discovery of the configured App page-data compiler module without
  reloading route config

### Persisted Stage 1 lazy single-route cache

The proxy dev path persists Stage 1 lazy single-route cache records in:

- `src/next/proxy/lazy/single-route-cache.ts`
- `src/next/proxy/lazy/route-plan-record.ts`

This cache stores only MDX-capture facts for one localized route file:

- `usedLoadableComponentKeys`
- `transitiveModulePaths`

It does not store:

- full `PlannedHeavyRoute` objects
- processor output
- emitted handler files

On a valid cache hit, the proxy path can skip MDX capture and reuse the cached
component keys. Heavy-route processor planning is still reconstructed in memory
from those keys, and the emitted handler file is still synchronized separately
when needed.

Validity for this layer comes from:

- the root route file still existing and remaining unchanged
- every persisted transitive MDX module path still existing and remaining
  unchanged
- the persisted record version still matching the current schema

### Parent-side lightweight bootstrap reuse

The parent proxy runtime keeps lightweight bootstrap state in:

- `src/next/proxy/runtime/bootstrap-state.ts`

This state contains only:

- whether any splitter targets exist
- configured route base paths for diagnostics
- the current `bootstrapGenerationToken`

This is value reuse, not heavy planning reuse. It deliberately stops before:

- runtime attachment loading
- planner construction
- single-route analysis

### Long-lived worker session reuse

The integration keeps long-lived worker sessions in two places:

- `src/next/proxy/worker/host/client.ts`
- `src/next/app/page-data-worker/host/client.ts`

Proxy worker session reuse keeps one worker alive across revisits while the
bootstrap generation remains unchanged.

App page-data compiler worker reuse keeps one worker alive per `rootDir` while
page-time compiler requests overlap across the same app root.

This is process/session reuse, not cached semantic route results.

App static-param filtering no longer has its own dedicated worker family. That
filtering now stays in the direct App path in `src/next/app/static-params.ts`.

### In-flight dedupe

In-flight dedupe currently exists in five places:

- `src/next/shared/prepare/index.ts`
- `src/next/proxy/runtime/bootstrap-state.ts`
- `src/next/proxy/worker/host/client.ts`
- `src/next/app/page-data-worker/host/client.ts`
- `src/next/proxy/lazy/cold-request-dedupe.ts`

These maps collapse overlapping identical work only while a promise is still
active. They do not remember settled results.

#### `prepare`

`src/next/shared/prepare/index.ts` shares one active prepare run when identical
callers overlap in the same process.

#### Parent bootstrap state

`src/next/proxy/runtime/bootstrap-state.ts` dedupes overlapping reads of the
proxy bootstrap manifest for the same locale/config-registration pair.

#### Proxy worker client

`src/next/proxy/worker/host/client.ts` keeps:

- `workerSessions`: long-lived proxy worker session reuse
- `inFlightLazyMissResolutions`: overlapping lazy-miss request dedupe

These solve different problems:

- keep one child process alive
- let overlapping compatible callers await the same shared session
  `readyPromise`
- avoid sending the same overlapping lazy request into that session twice

#### App page-data compiler worker client

`src/next/app/page-data-worker/host/client.ts` keeps:

- `workerSessions`: long-lived compiler worker session reuse

This lets page-time App route contracts share one isolated compiler worker.
Startup overlap for the same worker session is handled by the shared host
lifecycle machine through:

- registry lookup
- explicit host session phases
- one shared `readyPromise`

#### Worker-side cold lazy preparation

`src/next/proxy/lazy/cold-request-dedupe.ts` dedupes overlapping analysis and
one-file emission work after two requests have already converged to the same
target/file pair.

## Removed Layers

The current design intentionally does not keep:

- a settled-result prepare cache
- a persisted processor-plan cache beyond Stage 1 capture facts
- an adapter-side warm semantic cache of analyzed routes
- time-based TTL reuse for worker sessions

Those layers are avoided because they depend on time-based reuse, app-owned
identity contracts, or stale semantic results that are harder to validate than
to recompute safely.

## Practical Reading Guide

When debugging build or page-time reuse, read these files in order:

1. `src/next/shared/lookup-persisted.ts`
2. `src/next/shared/heavy-route-lookup.ts`
3. `src/next/app/static-params.ts`
4. `src/next/app/page-data-compiler-run.ts`
5. `src/next/app/page-data-worker/host/client.ts`

That sequence mirrors the current build/page-time model:

1. persisted heavy-route ownership
2. page-time lookup consumption
3. direct App static-param filtering
4. page-time compiler dispatch
5. isolated App page-data compilation

When debugging proxy/dev lazy reuse, read these files in order:

1. `src/next/shared/prepare/index.ts`
2. `src/next/proxy/runtime/bootstrap-state.ts`
3. `src/next/proxy/worker/host/client.ts`
4. `src/next/proxy/worker/runtime/bootstrap.ts`
5. `src/next/proxy/lazy/single-route-cache.ts`
6. `src/next/proxy/lazy/route-plan-record.ts`
7. `src/next/proxy/lazy/single-route-cache-manager.ts`
8. `src/next/proxy/lazy/cold-request-dedupe.ts`

That sequence mirrors the current proxy/dev model:

1. app-owned preparation
2. parent bootstrap reuse
3. parent worker-session and request dedupe
4. worker bootstrap state construction
5. persisted Stage 1 lazy-route cache
6. persisted capture record shape
7. generation-scoped cache lifecycle
8. worker-side in-flight analysis/emission dedupe
