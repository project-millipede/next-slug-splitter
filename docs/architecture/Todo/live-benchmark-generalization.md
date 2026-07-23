# Generalize The Live Benchmark Into An Application Harness

## Status

Future architectural direction. This document does not describe a committed
public API or authorize changes to the current benchmark measurement contract.

The immediate benchmark remains a controlled comparison of the repository's
App Router and Pages Router demonstrations. The long-term goal is to let a
normal Next.js application cooperate with `next-slug-splitter` and measure the
real client JavaScript affected by its route splitting.

## Current Benchmark

The current Live Benchmark owns four controlled targets:

1. App Router splitter
2. App Router heavy baseline
3. Pages Router splitter
4. Pages Router heavy baseline

The targets use synthetic ballast modules to create deterministic differences
between light, partially heavy, and fully heavy routes.

For every payload-bearing route, the benchmark currently:

1. Reads Next.js build manifests and resolves route-specific JavaScript chunk
   candidates.
2. Removes known framework, layout, and route-support resources.
3. Selects the uniquely largest emitted candidate by uncompressed filesystem
   size.
4. Publishes that candidate's exact facade pathname.
5. Loads the real route once in a hidden same-origin iframe.
6. Matches the selected pathname against the iframe's buffered Resource Timing
   entries.
7. Reports the selected request's status, encoded JavaScript bytes, decoded
   JavaScript bytes, and duration.

The final browser lookup is exact for the resource selected during the build.
The selection itself is a convention of the controlled demos: their synthetic
heavy dependency is intentionally much larger than the generated-page entry and
Turbopack route-loader chunks.

Selecting the largest emitted candidate is not a general guarantee that the
resource contains the complete client graph selected by `next-slug-splitter`.

## Long-Term Goal

A normal application should be able to benchmark its actual route and component
graphs without introducing ballast files, benchmark-only component markers, or
benchmark-specific rendering behavior.

The application would provide its ordinary content definitions and route
components. `next-slug-splitter` would remain the source of truth for the
semantic relationship between public routes, generated handlers, and selected
component imports.

The library would preserve that route plan across the Next.js build boundary.
An optional benchmark adapter, composed by `next-slug-splitter` behind its
installed `adapterPath`, would then correlate the retained module identities
with the client resources emitted by Next.js.

The existing facade and hidden-iframe mechanism would measure the corresponding
requests made by a real browser route load.

```text
Normal application content
          │
          ▼
Slug-splitter route analysis
          │
          ├─ public route
          ├─ generated handler
          └─ selected component imports
                      │
                      ▼
     Preserve semantic build route plan
                      │
                      ▼
                Next.js build
                      │
                      ▼
      Slug-splitter-composed adapterPath
                      │
                      └─ semantic route plan
                      └─ Next.js build outputs
                      │
                      ▼
       Heavy modules mapped to client resources
                      │
                      ▼
          Same-origin benchmark facade
                      │
                      ▼
            Hidden iframe route load
                      │
                      ▼
          Browser Resource Timing evidence
                      │
                      ▼
        Baseline versus splitter comparison
```

`next-slug-splitter` discovers which component graph belongs to the optimized
route. The composed adapter correlates that semantic graph with artifacts only
after Next.js has created them. These are two phases of one cooperation model,
not competing sources of route identity.

The browser should measure known heavy resources. It should not infer which
resources are heavy from filenames, byte thresholds, or request order.

## Heavy Payload Capture

Heavy payload capture is the central missing relationship in the generalized
design.

A generated route can contain several client resource families:

1. generated-page entry code;
2. Next.js or Turbopack route-loader code;
3. shared framework, runtime, and layout code;
4. JavaScript emitted from the component imports selected for the route.

The fourth family is the optimization payload the benchmark ultimately wants
to compare. Capturing it requires three distinct stages.

### 1. Semantic Capture

During route planning, `next-slug-splitter` already knows:

1. the public content route;
2. the generated-handler identity and output path;
3. the captured component keys;
4. the component imports selected by the route processor;
5. the target that owns the route.

The current pipeline uses those facts to emit the generated handler, but it
does not yet carry the complete semantic route plan across the build boundary
to an optional composed adapter.

A future cooperation boundary should be owned by `next-slug-splitter` and
preserve stable component module identities beyond handler generation. The
handoff could use a dedicated build-only artifact or another stable
library-owned mechanism.

The preserved information should be generic route-plan data, not
benchmark-specific metadata. A raw Next.js `onBuildComplete` context cannot
reconstruct these facts because it exposes routing and build outputs, but not
why slug-splitter classified a route as heavy or which component imports the
processor selected.

### 2. Build-Artifact Correlation

Next.js decides the final client chunk graph after slug-splitter route planning.
It may:

1. merge several selected component modules into one client chunk;
2. split one selected component graph across several client chunks;
3. extract dependencies shared with another route;
4. emit generated-page and route-loader chunks beside the component payload;
5. produce no client JavaScript for selected server-only modules.

The optional benchmark adapter runs through the `adapterPath` already installed
and composed by `next-slug-splitter`. It receives Next.js post-build metadata
and consumes the semantic route plan preserved by the library.

Its responsibility is to correlate selected component modules with zero or
more emitted client resources. It must not independently rediscover the split
from rewrites, filenames, or emitted sizes. The relationship is not reliably
represented by one filename or one largest artifact.

App Router client-reference manifests expose useful module-to-chunk information.
Pages Router build manifests primarily expose route-to-chunk collections. A
future implementation must establish a complete, validated correlation for
both router families rather than pretending that their available metadata is
identical.

The desired result is a route-owned resource collection, conceptually:

```ts
type HeavyPayloadResources = {
  routePath: string;
  generatedHandlerPath: string | null;
  resourcePaths: string[];
};
```

This is an illustrative internal model, not a proposed public type. The
resource collection may be empty when the selected route graph produces no
client JavaScript.

### 3. Browser Validation And Measurement

The hidden iframe performs the real route navigation. When its document load
completes, the benchmark intersects the build-resolved heavy resource paths
with the iframe's buffered Resource Timing entries.

The browser stage should:

1. validate the iframe document response;
2. read the buffered resource entries once;
3. require every expected initial client resource to have been requested;
4. reject unsuccessful or unusable resource evidence;
5. measure each matching resource exactly once;
6. aggregate encoded and decoded JavaScript bytes;
7. derive an explicitly defined duration for the complete resource set.

The browser validates and measures heavy-resource identity established during
build processing. It does not rediscover that identity by selecting a large
network request.

## Current Heavy-Payload Approximation

The current benchmark does not preserve a module-to-chunk relationship from
heavy-route processing through the Next.js build.

It currently substitutes the following rule:

```text
router-specific route candidates
          │
          ▼
remove known shared candidates
          │
          ▼
select the unique largest emitted file
          │
          ▼
publish and measure that exact resource
```

This approximation works for the controlled ballast targets because their
artificial component graph dominates the candidate sizes. It should remain an
isolated selection policy and must not become part of the long-term application
benchmark contract.

The current implementation should use neutral payload terminology around its
published result while naming the temporary selection function precisely, for
example `selectLargestEmittedRouteChunk`.

## Why Ballast Markers Are Not The General Contract

An explicit string inside the ballast modules could identify the intended
payload chunks in the current repository builds. That could be useful as a
fixture assertion, but it would not generalize to normal applications.

An application using the future harness should not have to:

1. modify its heavy components for the benchmark;
2. embed benchmark-specific string markers;
3. depend on the ballast package;
4. ensure that one component graph always becomes exactly one chunk.

Ballast remains a controlled demonstration fixture. It must not become the
protocol between `next-slug-splitter` and the benchmark harness.

## Ownership Boundaries

### `next-slug-splitter`

The library owns semantic optimization information and the handoff required to
carry that information into optional post-build integrations:

1. route and target identity;
2. heavy versus light route ownership;
3. generated-handler identity;
4. selected component keys and component imports;
5. preservation of the semantic build route plan.

Next.js creates the final client chunk names, so slug-splitter cannot know them
during route planning. However, slug-splitter still owns the semantic side of
the correlation and the composed adapter integration point through which the
post-build mapping can occur.

### Optional Benchmark Adapter

The benchmark adapter is not an independent source of heavy-route truth. It is
an optional post-build extension composed by `next-slug-splitter` behind the
installed `adapterPath`.

It connects the library-owned semantic route plan with Next.js build output,
owns build-artifact correlation, and publishes browser-visible resource paths.

The adapter must not identify application payloads through synthetic ballast
knowledge, rewrite inference, or emitted file size in the generalized design.

### Benchmark Facade

The facade exposes independently built or deployed targets beneath one
browser-visible origin. It preserves encoded `_next` asset responses so browser
Resource Timing can report meaningful encoded and decoded sizes.

The facade transports application responses. It does not execute or inspect
the client JavaScript being measured.

### Browser Measurement

The browser performs genuine application navigations in hidden iframes and
measures the resources requested by those navigations.

It should not issue a second JavaScript request merely to determine bytes or
duration, and it should not rely on a fixed post-load settlement delay to find
resources that were already part of the completed initial document load.

## Baseline And Splitter Builds

The generalized benchmark needs two comparable application variants:

1. a baseline in which the relevant catch-all route retains the unsplit
   component universe;
2. a splitter variant in which route-specific generated handlers import only
   the selected component graph.

Both variants must otherwise represent the same application behavior, content,
and deployment conditions closely enough for the comparison to remain useful.

The exact baseline mechanism is intentionally unresolved. Possible models
include:

1. two explicit application configurations;
2. one configuration with slug splitting disabled for the baseline build;
3. a target-provided unsplit comparison route.

The harness should not silently manufacture an invalid baseline by changing
unrelated application behavior.

## Desired Measurement Contract

The generalized contract should describe zero or more heavy client resources
per route rather than one presumed payload chunk.

A future measurement flow could:

1. load the semantic route plan produced alongside the splitter build;
2. load the build-resolved heavy resource collection for each target variant;
3. navigate the splitter route once in a hidden iframe;
4. measure the exact expected resources requested by that navigation;
5. navigate the baseline route separately so the two loads do not compete;
6. measure its expected heavy resources;
7. compare their encoded bytes, decoded bytes, and defined completion timing;
8. retain request-level diagnostics so aggregate results remain explainable.

The existing benchmark result already represents measured JavaScript as a
collection. That shape leaves room for this future multi-resource contract even
though the current manifest intentionally selects zero or one resource.

## Suggested Evolution

### Stage 1: Preserve The Current Benchmark

1. Keep the current largest-candidate selector isolated.
2. Use route-payload terminology for the current measurement contract.
3. Document the selector as a controlled-demo approximation.
4. Keep exact browser matching and fail-fast evidence validation.

### Stage 2: Publish Semantic Route Plans

1. Define the minimum generic route and component identities that
   `next-slug-splitter` must preserve.
2. Publish a build-only semantic route plan after generated-handler emission.
3. Make that plan available to optional adapters composed through the
   library-owned `adapterPath`.
4. Keep it separate from runtime lookup snapshots unless runtime behavior
   genuinely needs the same data.
5. Avoid benchmark-specific fields in the library contract.
6. Validate that the plan works for both eager generation and any later lazy
   generation path.

### Stage 3: Correlate Heavy Modules With Build Output

1. Let the composed benchmark adapter consume both the semantic route plan and
   Next.js `onBuildComplete` output.
2. Research the stable App Router module-to-client-resource mapping.
3. Research an equally defensible Pages Router mapping.
4. Represent one-to-many and many-to-one module/chunk relationships.
5. Fail explicitly when the build evidence cannot establish a complete
   resource set.

### Stage 4: Measure Real Applications

1. Let an application declare its baseline and splitter targets.
2. Serve both variants through the existing same-origin facade model.
3. Measure their real routes through hidden iframes.
4. Add release verification for the configured route and resource contracts.

## Non-Goals For The Current Work

The current cleanup should not:

1. add a ballast marker to the public library API;
2. make `next-slug-splitter` control Next.js chunking;
3. claim that the largest route candidate is universally the heavy payload;
4. introduce arbitrary TypeScript or JavaScript application analysis;
5. generalize beyond Next.js before the App Router and Pages Router mappings are
   understood;
6. replace the working benchmark while the generalized contract remains
   unresolved.

## Open Questions

1. Which component-import identity survives package exports, aliases, and
   monorepo paths reliably enough for build correlation?
2. Which Next.js artifacts provide a complete module-to-client-resource mapping
   for each router and supported bundler?
3. How should shared dependencies owned partly by the heavy graph be counted?
4. How should a selected component that produces no client JavaScript be
   represented?
5. How should concurrent heavy-resource durations be aggregated without
   summing overlapping network work?
6. How should the harness construct or validate a behaviorally equivalent
   baseline?
7. How should authenticated, private, or cookie-dependent applications be
   exposed safely through the facade?
8. Which deployment facts must be pinned so repeated benchmark runs remain
   comparable?

## Success Criteria

The generalized harness is successful when:

1. a normal Next.js application can opt in without ballast or source markers;
2. the application can pair a valid baseline and splitter build;
3. slug-splitter semantic component identity reaches the build-correlation
   boundary;
4. App Router and Pages Router publish the same measurement model;
5. the model supports zero, one, or several heavy client resources;
6. measurements come from actual browser route loads;
7. encoded and decoded byte evidence remains traceable to exact requests;
8. missing or incomplete build or browser evidence fails explicitly;
9. the benchmark no longer infers application payload identity from emitted
   file size.

## Current Recommendation

Keep the current Live Benchmark focused on the controlled demos while making
its temporary largest-candidate policy explicit and replaceable.

Do not add a ballast marker or benchmark-specific library API as part of the
current terminology cleanup. The next architectural investigation should focus
on carrying slug-splitter's selected component imports into its optional
post-build adapter collaboration and correlating them with Next.js client
resources for both router families.
