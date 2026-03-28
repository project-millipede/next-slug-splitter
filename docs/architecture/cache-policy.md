# Cache Policy

This note summarizes the cache and reuse policy for the current Next integration.

The main goal is to keep reuse explicit and validity-based:

- keep persisted reuse only where the library owns a stable artifact
- keep in-flight dedupe where overlapping work is wasteful
- avoid warm semantic caches keyed by time or app-owned identity hooks

## Current Layers

### Persisted bootstrap-owned lookup snapshot

The route-handler integration now also persists a page-time lookup snapshot in:

- `src/next/lookup-persisted.ts`

This snapshot lives separately from the Next-derived runtime-semantics snapshot.
It stores only route-handler lookup state:

- whether page-time heavy-route filtering is enabled
- target ids
- heavy-route path keys per target

It does not store:

- raw `routeHandlersConfig`
- locale semantics
- processor configuration
- plugin functions

### Persisted semantic cache

The main persisted semantic cache is the lazy single-route cache in:

- `src/next/proxy/lazy/single-route-cache.ts`

This cache stores one-file route-plan records for lazy heavy-route analysis.

It is not the emitted handler file itself. It stores reusable planning data such
as whether the route is light or heavy and the planned heavy-route record. On a
later request, that cached plan is combined with a live emitted-handler
existence check before emission is skipped.

Validity checks include:

- route file still exists
- route file checksum is unchanged
- cache record version still matches
- `bootstrapGenerationToken` still matches

### Parent-side lightweight bootstrap reuse

The parent proxy runtime keeps lightweight bootstrap state in:

- `src/next/proxy/runtime/bootstrap-state.ts`

This state contains only:

- whether route-handlers config is present
- configured route base paths for diagnostics
- the current `bootstrapGenerationToken`

This is value reuse, not heavy planning reuse.

### Long-lived worker session reuse

The proxy worker client keeps long-lived worker sessions in:

- `src/next/proxy/worker/client.ts`

This reuse layer keeps the worker process alive across revisits while the
`bootstrapGenerationToken` remains unchanged.

This is process/session reuse, not cached semantic route results.

### In-flight dedupe

In-flight dedupe remains in three places:

- `src/next/prepare/index.ts`
- `src/next/proxy/worker/client.ts`
- `src/next/proxy/lazy/cold-request-dedupe.ts`

These dedupe maps only collapse overlapping identical work while a promise is
still active. They do not remember settled results.

#### `prepare`

`src/next/prepare/index.ts` shares one active prepare run when identical callers
overlap in the same process.

#### Parent worker client

`src/next/proxy/worker/client.ts` keeps:

- `workerSessions`: long-lived worker session reuse
- `inFlightLazyMissResolutions`: overlapping identical request dedupe

These solve different problems:

- `workerSessions` keeps one child process alive
- `inFlightLazyMissResolutions` prevents sending the same overlapping request
  into that session twice

#### Worker-side cold lazy preparation

`src/next/proxy/lazy/cold-request-dedupe.ts` dedupes overlapping analysis and
emission work after two requests have already converged to the same target/file
pair.

## Removed Layers

The following layers were intentionally removed:

- persistent prepare cache
- warm adapter process cache
- processor cache identity / processor-owned cache hints
- parent-side worker TTL cache

These layers were removed because they relied on time-based reuse, app-owned
identity contracts, or stale semantic reuse that was harder to validate than to
recompute safely.

## Practical Reading Guide

When debugging reuse behavior, read the files in this order:

1. `src/next/proxy/runtime/bootstrap-state.ts`
2. `src/next/proxy/worker/client.ts`
3. `src/next/proxy/worker/bootstrap.ts`
4. `src/next/proxy/lazy/single-route-cache.ts`
5. `src/next/proxy/lazy/cold-request-dedupe.ts`

That sequence mirrors the actual runtime model:

1. parent bootstrap state
2. parent worker session management
3. worker bootstrap
4. persisted one-file route-plan reuse
5. in-flight analysis/emission dedupe
