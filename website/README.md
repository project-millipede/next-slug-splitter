# next-slug-splitter Live Benchmark

> Browser-observed JavaScript payload comparisons across controlled Next.js targets

This directory contains the benchmark interface and same-origin facade for four
controlled Next.js demo targets. It compares one exact build-selected
JavaScript payload from a splitter target with the corresponding payload from
an unsplit heavy baseline.

App Router and Pages Router use the same manifest and browser-measurement
contract.

## Table of Contents

1. [Overview](#overview)
2. [Benchmark Flow](#benchmark-flow)
3. [Architecture](#architecture)
4. [Local Development](#local-development)
5. [Deployment](#deployment)
6. [Measurement Contract](#measurement-contract)
7. [Source Map](#source-map)

## Overview

### Website Responsibilities

The website has four responsibilities:

1. Render the benchmark interface.
2. Expose every demo target through a same-origin `/zones/<target>` facade.
3. Load splitter and baseline routes in hidden iframes.
4. Match each build-selected JavaScript payload with its browser Resource
   Timing entry and present the comparison.

### Target Responsibilities

The target applications have two separate responsibilities:

1. Emit route-payload manifests during their production builds.
2. Serve their normal application routes and generated JavaScript assets.

The website does not determine payload identity in the browser. It consumes the
identity selected by each target build.

## Benchmark Flow

### How One Comparison Runs

One route comparison runs in this order:

1. The website fetches the splitter target's static payload manifest.
2. It loads the splitter route once through the same-origin facade.
3. At iframe `load`, it reads the exact selected JavaScript request from the
   iframe's buffered Resource Timing entries.
4. It repeats those steps for the heavy baseline.
5. It presents the splitter relative to that baseline.

Splitter and baseline loads are sequential so they do not compete for the same
browser, network, or server resources during one comparison. `Run all visible`
also processes rows sequentially.

The selected JavaScript is not fetched a second time for measurement. Its real
iframe request supplies the byte sizes and duration.

### Reading the Results

| Result | Browser source | Meaning |
| --- | --- | --- |
| Payload identity | Manifest `payloadChunk` plus an exact Resource Timing pathname match | The one build-selected route-specific JavaScript resource. |
| Encoded JS | `PerformanceResourceTiming.encodedBodySize` | Bytes in the transferred JavaScript representation before HTTP content decoding. |
| Decoded JS | `PerformanceResourceTiming.decodedBodySize` | JavaScript bytes after HTTP content decoding, before parsing or execution. |
| Load duration | `PerformanceResourceTiming.duration` | Duration of the same selected JavaScript request. |
| Overall measured time | `performance.now()` around the comparison | Orchestration wall time for the sequential splitter and baseline measurements. |

`encodedBodySize` and `decodedBodySize` are browser API property names. The
benchmark maps them to its JavaScript-specific `encodedJsByteSize` and
`decodedJsByteSize` model.

Internal differences use `baseline - splitter`. The interface presents the
splitter relative to the baseline:

- A negative displayed value is a saving.
- A positive displayed value is a regression.
- Zero means no observed difference.

An intentional light-route result of `0 B / 0 ms` means the splitter manifest
declares no selected route-specific payload. It does not mean that the complete
page requested no JavaScript.

## Architecture

### Payload Manifest Contract

Each splitter demo emits its exact-payload manifest during `pnpm build`:

```txt
/_next/static/__benchmark/splitter-route-payload.json
```

Each heavy-baseline demo emits:

```txt
/_next/static/__benchmark/heavy-baseline-route-payload.json
```

For every payload-bearing route, the adapter:

1. Resolves the router-specific JavaScript candidates.
2. Maps every browser-visible facade path back to its emitted build artifact.
3. Reads the emitted file sizes.
4. Selects the uniquely largest emitted artifact.
5. Publishes its exact browser-visible facade path as `payloadChunk`.

An empty candidate collection or equally largest candidates fail the target
build. Light splitter routes intentionally have no manifest entry.

For every nonzero target measurement, the website:

1. Starts one five-second target budget.
2. Fetches the manifest through the target's `/zones/...` facade.
3. Resolves the public route to its exact `payloadChunk`.
4. Loads the route in a cache-busted hidden iframe.
5. Reads the iframe's buffered Resource Timing entries once when `load` fires.
6. Requires one resource entry whose pathname exactly equals `payloadChunk`.
7. Validates the required measurement evidence.
8. Removes the iframe after success or failure.

The five-second budget covers the manifest request, iframe navigation, and
evidence validation for one target. It is only a failure deadline and never a
measurement input.

### Same-Origin Facade and Asset Transport

The target apps own their real routes and assets at the root of their own
deployment:

```txt
/de
/docs/dashboard
/_next/static/...
```

The website owns the browser-visible facade:

```txt
/zones/<target>/...
```

Example mappings:

| Browser-visible website path | Upstream target path |
| --- | --- |
| `/zones/page-router-heavy/de` | `/de` |
| `/zones/page-router-heavy/docs/dashboard` | `/docs/dashboard` |
| `/zones/page-router-heavy/_next/static/...` | `/_next/static/...` |

The facade has two response paths:

| Request | Facade behavior |
| --- | --- |
| Page, RSC, or other non-`_next` request | Uses the normal fetch-based facade, filters unsafe upstream headers, and rewrites textual target URLs into same-origin zone URLs when required. |
| `GET /_next/...` asset | Attempts Node HTTP raw passthrough, preserving the encoded JavaScript response bytes and their `Content-Encoding`, `Content-Length`, and `Vary` metadata. |

Raw passthrough is used only when the upstream response can be forwarded
unambiguously. Redirects or ambiguous `Content-Encoding` metadata fall back to
the normal facade path.

On the successful raw path:

1. The browser issues one same-origin asset request.
2. The facade issues one corresponding server-to-target request.
3. Node exposes the upstream response before automatic decoding.
4. The facade streams the encoded JavaScript response bytes unchanged.
5. The browser receives the response once, decodes it, and executes the
   JavaScript.

The asset is not decoded, rewritten, or executed inside the website server.
The response uses `no-store, no-transform` so browser or intermediary reuse and
representation changes do not invalidate the observation.

This preservation allows `encodedBodySize` to describe the transferred
representation and `decodedBodySize` to describe the JavaScript representation
after HTTP content decoding.

See the
[raw passthrough response-flow diagram](../docs/architecture/facade/raw-passthrough.svg)
for the complete normal-facade and raw-passthrough comparison.

The benchmark manifests bridge those two worlds. They are generated by the
target build, but their selected payload URLs are serialized as
website-visible facade paths so the benchmark can match browser
`PerformanceResourceTiming` entries. `BENCHMARK_ZONE_PATH` provides that
facade prefix during manifest generation. It does not configure Next.js
`basePath`, `assetPrefix`, routing, or asset serving for the target app.

## Local Development

### Commands

Run commands from the repository root.

| Goal | Command |
| --- | --- |
| Build and start production targets with the website in development mode | `pnpm --dir website benchmark:local:dev` |
| Build the complete local benchmark stack | `pnpm --dir website benchmark:local:build` |
| Start the already-built stack entirely in production mode | `pnpm --dir website benchmark:local:start` |
| Start already-built production targets with the website in development mode | `pnpm --dir website benchmark:local:start:website-dev` |

The main local development command is:

```bash
pnpm --dir website benchmark:local:dev
```

It performs this sequence:

1. Builds the benchmark manifest adapter and local stack runner.
2. Builds the root `next-slug-splitter` library.
3. Builds all four splitter and heavy-baseline targets.
4. Writes route-payload manifests with browser-visible `/zones/...` paths.
5. Starts the targets in production mode on ports `4001`-`4004`.
6. Starts the website in development mode on port `4000`.

Open <http://127.0.0.1:4000/benchmark>.

The targets run in production mode because the benchmark measures emitted
production chunks and build-generated manifests. The website runs in
development mode so interface work can iterate quickly. The runner rejects
occupied ports before startup, and `Ctrl-C` stops all child processes.

### Local Verification

With the complete local stack running, execute:

```bash
node .github/scripts/verify-benchmark-release.mjs deployments \
  --website http://127.0.0.1:4000 \
  --app-splitter http://127.0.0.1:4001 \
  --app-baseline http://127.0.0.1:4002 \
  --pages-splitter http://127.0.0.1:4003 \
  --pages-baseline http://127.0.0.1:4004
```

The verifier checks:

1. Supported direct and facade routes.
2. Unsupported-locale behavior.
3. Manifest schema, route keys, generated handlers, and payload paths.
4. Direct and facade payload availability.
5. The facade's `x-benchmark-target` response identity.
6. Direct and facade manifest equality.
7. `no-store, no-transform` on measured facade assets.

Then verify the browser-only measurement path:

1. Open `/benchmark`.
2. Select the App Router target.
3. Run each light and heavy route.
4. Run all visible routes.
5. Repeat the same checks for Pages Router.
6. Confirm that light routes report intentional zero, heavy routes report
   nonzero payloads, and no measurement errors appear.

## Deployment

### Deployment Topology

The production website and its linked runnable applications form one
coordinated release across six Vercel projects:

| Project | Responsibility |
| --- | --- |
| Website | Benchmark interface and same-origin facade |
| App Router splitter zone | Splitter App Router target and manifest |
| App Router heavy-baseline zone | Unsplit App Router baseline and manifest |
| Pages Router splitter zone | Splitter Pages Router target and manifest |
| Pages Router heavy-baseline zone | Unsplit Pages Router baseline and manifest |
| Fumadocs integration | Public runnable framework integration linked from the website |

During every target build, set:

- `BENCHMARK_ZONE_PATH` to its website facade path, such as
  `/zones/page-router-heavy`.
- `BENCHMARK_MANIFEST_KIND` to the manifest kind emitted by that target.

`BENCHMARK_ZONE_PATH` is only consumed by benchmark manifest generation. It
does not set Next.js `basePath`, so direct target previews keep normal routes
such as `/de` and `/docs/dashboard`, while the website still serves the same
target under `/zones/page-router-heavy/de`.

Set these env vars on the benchmark project:

- `BENCHMARK_APP_ROUTER_MULTI_LOCALE_ORIGIN`
- `BENCHMARK_APP_ROUTER_MULTI_LOCALE_HEAVY_ORIGIN`
- `BENCHMARK_PAGE_ROUTER_ORIGIN`
- `BENCHMARK_PAGE_ROUTER_HEAVY_ORIGIN`

All four origins must identify targets from the same coordinated release. The
target deployments continue serving their direct routes at root. Only the
website exposes `/zones/...` paths.

Inside the benchmark UI, the browser should only see benchmark URLs such as
`/zones/app-router-multi-locale/docs/dashboard`. Direct target deployment URLs
remain useful for inspecting an individual demo app at its normal root.

Do not partially promote a release. A website paired with manifests or chunks
from another release can produce false failures or invalid comparisons.

### Production Release

`.vercel/` and `vercel.json` have separate responsibilities:

1. `.vercel/` contains machine-local Vercel CLI linkage and remains ignored.
2. Each `vercel.json` contains repository-owned deployment policy and remains
   versioned.
3. Because these files disable automatic Git deployment from `main`, they must
   be committed together with the workflow that stages, verifies, and promotes
   the coordinated release.

All six release projects disable automatic Vercel Git deployment from `main`
in their `vercel.json` files. Pushes to `main` are instead released
automatically through
[the benchmark production workflow](../.github/workflows/release-benchmark-production.yml).
`workflow_dispatch` remains available for explicit retries.

The workflow:

1. Builds the root library and refreshes all `file:` dependency snapshots.
2. Runs repository validation and tests.
3. Deploys six immutable candidates without moving production domains.
4. Verifies the direct benchmark targets, candidate website facade, and
   Fumadocs routes.
5. Confirms that `main` still identifies the staged release commit.
6. Promotes all six verified candidates as one coordinated release.
7. Verifies production again.
8. Rolls back any already-promoted project when production promotion or
   verification fails.

The repository requires:

- Secret `VERCEL_TOKEN`.
- Variable `VERCEL_ORG_ID`.
- Six Vercel project-ID variables used by the workflow.
- A `production` environment used for deployment history, without required
  reviewers.

## Measurement Contract

### Required Payload Evidence

Every selected payload measurement requires:

1. An exact manifest-selected resource pathname.
2. A positive encoded JavaScript byte size.
3. A positive decoded JavaScript byte size.
4. A positive resource duration.

Missing or invalid required evidence fails the measurement. It is not converted
into a warning or a zero value.

### Optional Response-Status Validation

`PerformanceResourceTiming.responseStatus` is additional validation and
diagnostic evidence:

| Browser evidence | Benchmark behavior |
| --- | --- |
| Finite 2xx status | Continues with the required payload evidence |
| Finite non-2xx status | Fails the measurement |
| Status unavailable | Continues only when all required payload evidence remains valid |
| Intentional light-route zero | Expects no payload status, byte-size, or duration evidence |

The status never contributes to encoded size, decoded size, load duration, or
savings calculations. Navigation and payload statuses come from their
respective performance entries and are not treated as one shared value.

When a browser does not expose `responseStatus`, iframe `load` proves that the
navigation completed but cannot independently prove that the response returned
2xx. An error response with otherwise usable Resource Timing evidence cannot be
distinguished by status alone.

### Scope Limitations

1. The benchmark measures one build-selected route payload, not all JavaScript
   requested by the page.
2. Shared framework, runtime, and layout chunks are intentionally excluded.
3. Payload selection uses uncompressed emitted file size; the displayed encoded
   and decoded values come from the browser request.
4. The selected payload must be an initial external resource buffered by iframe
   `load`; late dynamic imports are outside the current contract.
5. Each run is one cache-busted browser observation, not a median or controlled
   laboratory sample.
6. The HTTP release verifier validates deployment contracts but does not execute
   the benchmark interface or browser Resource Timing API.

The planned path toward user-defined production routes and explicit library
payload identity is documented in
[live benchmark generalization](../docs/architecture/Todo/live-benchmark-generalization.md).

## Source Map

- Browser comparison orchestration:
  [`features/benchmark/measurement/measure-route.ts`](features/benchmark/measurement/measure-route.ts)
- Exact payload observation:
  [`features/benchmark/measurement/measure-payload-chunk.ts`](features/benchmark/measurement/measure-payload-chunk.ts)
- Browser manifest resolution:
  [`features/benchmark/measurement/payload-manifest.ts`](features/benchmark/measurement/payload-manifest.ts)
- Build-time payload selection:
  [`packages/benchmark-manifest-adapter/src/payload-manifest.ts`](../packages/benchmark-manifest-adapter/src/payload-manifest.ts)
- Zone route:
  [`app/zones/[target]/[[...path]]/route.ts`](<app/zones/[target]/[[...path]]/route.ts>)
- Fetch-based facade:
  [`lib/benchmark/server/facade.ts`](lib/benchmark/server/facade.ts)
- Raw asset passthrough:
  [`lib/benchmark/server/raw-asset-passthrough.ts`](lib/benchmark/server/raw-asset-passthrough.ts)
- Release verifier:
  [`.github/scripts/verify-benchmark-release.mjs`](../.github/scripts/verify-benchmark-release.mjs)
- Production workflow:
  [`.github/workflows/release-benchmark-production.yml`](../.github/workflows/release-benchmark-production.yml)
- Response-flow diagram:
  [`docs/architecture/facade/raw-passthrough.svg`](../docs/architecture/facade/raw-passthrough.svg)
- Future generalization:
  [`docs/architecture/Todo/live-benchmark-generalization.md`](../docs/architecture/Todo/live-benchmark-generalization.md)
