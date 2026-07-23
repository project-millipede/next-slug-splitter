# Fumadocs + next-slug-splitter

> Route-specific heavy MDX component isolation for a Fumadocs App Router site

This runnable integration shows how `next-slug-splitter` keeps heavy MDX
components out of unrelated page chunks while preserving the normal Fumadocs
layout, source, and rendering model.

This directory is a repository fixture and production-build benchmark. For the
library-wide model and configuration reference, see the
[root README](../../../README.md).

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Explore the Example](#explore-the-example)
4. [Integration Setup](#integration-setup)
5. [Fixture-Specific Choices](#fixture-specific-choices)
6. [Fumadocs Source Loading](#fumadocs-source-loading)
7. [Reference](#reference)

## Overview

### What `next-slug-splitter` adds

A normal Fumadocs application serves its documentation through one authored
catch-all route. `next-slug-splitter` analyzes the configured MDX content and
separates those pages into two groups:

- Light pages continue through the authored Fumadocs catch-all route.
- Heavy pages receive generated handlers that import only the components used
  by that page.

Public URLs remain unchanged. Routing sends a heavy page request to its
generated handler while light pages continue to use the catch-all route.

In this fixture, generated handlers are written to
`app/docs/generated-handlers/`. The directory is ignored by Git and regenerated
by the `dev` and `build` commands.

### What Fumadocs still owns

The integration keeps the normal Fumadocs application boundary:

- `app/docs/[[...slug]]/page.tsx` remains the public docs catch-all route.
- `app/docs/layout.tsx` renders `DocsLayout` with the generated page tree.
- `app/layout.tsx` installs the Fumadocs `RootProvider`.
- `components/mdx.tsx` extends the standard Fumadocs MDX component map.
- The route contract continues to load Fumadocs page data and metadata.
- Authored and generated pages render through `DocsPage`, `DocsTitle`,
  `DocsDescription`, and `DocsBody`.

The splitter owns only the route boundary and route-specific heavy-component
imports.

For the broader model, see [Why Use It?](../../../README.md#why-use-it),
[App Router Catch-All Targets](../../../README.md#app-router-catch-all-targets),
and [Operation Modes](../../../README.md#operation-modes).

## Quick Start

From the repository root:

```bash
pnpm install
pnpm --filter next-slug-splitter-fumadocs-integration dev
```

Open <http://localhost:3000> for the integration homepage, or open
<http://localhost:3000/docs> to enter the documentation directly.

The `dev` script clears stale handlers, prepares the shared demo components,
regenerates the Fumadocs source files, and starts Next.js. No separate
route-generation command is required.

The homepage remains outside the splitter target. Route-specific splitting
continues to apply only to the documentation routes below `/docs`.

## Explore the Example

### Example routes

| Route                   | MDX content                             | Expected loading behavior            |
| ----------------------- | --------------------------------------- | ------------------------------------ |
| `/docs`                 | Light integration overview              | No route-specific heavy widget chunk |
| `/docs/getting-started` | Light content and `Callout`             | No route-specific heavy widget chunk |
| `/docs/interactive`     | `ExamplePreview`                        | Only the interactive widget chunk    |
| `/docs/dashboard`       | `FlowComposer` and `ComponentWorkbench` | Only the dashboard widget chunks     |

The light routes remain on the authored Fumadocs catch-all page. Routes using
heavy components are served by generated handlers that import only the
components captured from that route's MDX.

### Verify production isolation

Build and start the integration from the repository root:

```bash
pnpm --filter next-slug-splitter-fumadocs-integration build
pnpm --filter next-slug-splitter-fumadocs-integration start
```

In a fresh browser session, open the Network panel, filter for JavaScript, and
load each example route directly. The expected result is:

1. `/docs` and `/docs/getting-started` do not load the interactive or dashboard
   chunks, including after idle time.
2. `/docs/interactive` loads its route-specific interactive chunk but not the
   dashboard chunks.
3. `/docs/dashboard` loads its route-specific dashboard chunks but not the
   interactive chunk.

These observations assume the benchmark navigation controls described below
remain enabled.

## Integration Setup

The fixture uses the same four integration steps as a normal Fumadocs App
Router application.

### 1. Compose Fumadocs and `next-slug-splitter`

`next.config.ts` applies the Fumadocs MDX plugin first and then installs the
splitter adapter:

```ts
const withMDX = createMDX();

export default withSlugSplitter(withMDX(nextConfig), {
  routeHandlersConfig
});
```

### 2. Configure the docs target

`route-handlers-config.ts` declares the optional catch-all route, its content
directory, shared route contract, and processor module:

```ts
createAppCatchAllRouteHandlersPreset({
  targetId: 'docs',
  routeSegment: 'docs',
  handlerRouteParam: {
    name: 'slug',
    kind: 'optional-catch-all'
  },
  contentDir: path.join(rootDir, 'content', 'docs'),
  contentLocaleMode: 'default-locale',
  routeContract: relativeModule('app/docs/[[...slug]]/route-contract'),
  handlerBinding: {
    processorImport: relativeModule('dist/handler-processor')
  }
});
```

The app-level `prepare` step compiles the TypeScript processor before the
splitter loads it.

### 3. Select heavy MDX components

`handler-processor.ts` receives the component names captured from each MDX
page. It keeps the heavy component names and maps them to named imports from
`@next-slug-splitter/ballast-kit`.

`Callout` is intentionally omitted from generated imports because it is already
available through the shared MDX component scope.

### 4. Share the Fumadocs route contract and page UI

The authored catch-all page and generated handlers both use
`app/docs/[[...slug]]/route-contract.ts` for static params, metadata, and page
data.

Both paths also use `lib/handler-factory`, so light and heavy pages render
through the same Fumadocs page components. The only route-specific difference
is the heavy-component registry imported by a generated handler.

## Fixture-Specific Choices

These settings make the repository fixture deterministic and suitable for
production chunk inspection. They are not all required in a normal Fumadocs
application.

### Navigation prefetch controls

The fixture disables two normal Fumadocs navigation behaviors:

- Sidebar prefetch is disabled with `prefetch: false` in
  `app/docs/layout.tsx`.
- Previous/next footer navigation is disabled with `enabled: false` in
  `lib/handler-factory/index.tsx`.

Without these controls, Next.js may prefetch visible sibling links after
hydration or during idle time. Those requests can make unrelated route chunks
appear in the Network panel even when the intended route boundaries were
generated correctly.

A normal Fumadocs application can keep its preferred navigation and prefetch
behavior.

### Source-loading choice

The fixture uses Fumadocs' default eager source mode because it provides the
stronger splitter demonstration. The shared route contract also supports async
source mode; the next section compares both modes in detail.

## Fumadocs Source Loading

Fumadocs supports eager and async source generation:

| Mode  | Fumadocs setting                 | Generated source       | Relevance to this fixture                                                                                                             |
| ----- | -------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Eager | `docs.async` omitted or disabled | `create.docs(...)`     | Fumadocs binds compiled MDX bodies eagerly, leaving route-specific heavy-component isolation visible as splitter behavior             |
| Async | `docs.async: true`               | `create.docsLazy(...)` | Fumadocs imports each MDX body on demand; the splitter remains compatible and still generates route-specific heavy-component handlers |

### Eager mode

The generated `.source/server.ts` imports every compiled MDX module through its
server index:

```ts
import * as dashboard from '../content/docs/dashboard.mdx?collection=docs';
import * as interactive from '../content/docs/interactive.mdx?collection=docs';
```

In this mode, `page.data.body` is available when the route requests the page.
The splitter-generated handler still controls which heavy client components
are reachable from that route.

### Async mode

With `docs.async: true`, the generated server index stores each MDX body behind
a native dynamic import:

```ts
{
  'dashboard.mdx': () => import('../content/docs/dashboard.mdx?collection=docs')
}
```

Fumadocs then exposes `page.data.load()` for loading the current page body. This
is Fumadocs source loading, not `next/dynamic`, and it does not create a React
client-component boundary by itself.

### Shared route contract

The route contract normalizes both source modes before passing page data to the
shared handler factory:

```ts
const loadedData = await loadPageData(page.data);

return {
  page: {
    ...page,
    data: {
      ...page.data,
      ...loadedData
    }
  },
  MDX: loadedData.body
};
```

Eager mode uses the body already present on `page.data`; async mode loads only
the requested MDX module. In both cases, generated handlers import only the
heavy components selected for the current route.

## Reference

### Key files

| File                                                                                 | Responsibility                                                              |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| [`next.config.ts`](./next.config.ts)                                                 | Composes Fumadocs and `next-slug-splitter`                                  |
| [`source.config.ts`](./source.config.ts)                                             | Defines the Fumadocs content source                                         |
| [`route-handlers-config.ts`](./route-handlers-config.ts)                             | Configures the docs target and route contract                               |
| [`content/docs/index.mdx`](./content/docs/index.mdx)                                 | Provides the documentation integration overview                            |
| [`content/docs/meta.json`](./content/docs/meta.json)                                 | Controls the documentation sidebar order                                   |
| [`handler-processor.ts`](./handler-processor.ts)                                     | Selects heavy MDX components and their imports                              |
| [`app/docs/[[...slug]]/page.tsx`](./app/docs/[[...slug]]/page.tsx)                   | Owns the public catch-all route                                             |
| [`app/docs/[[...slug]]/route-contract.ts`](./app/docs/[[...slug]]/route-contract.ts) | Loads Fumadocs page data for authored and generated routes                  |
| [`lib/handler-factory/index.tsx`](./lib/handler-factory/index.tsx)                   | Renders the shared Fumadocs page UI                                         |
| [`components/mdx.tsx`](./components/mdx.tsx)                                         | Combines Fumadocs defaults with route-specific components                   |
| `app/docs/generated-handlers/`                                                       | Generated heavy handlers; ignored by Git and recreated by `dev` and `build` |

### Useful commands

Run these commands from the repository root:

| Command                                                                   | Purpose                                              |
| ------------------------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm --filter next-slug-splitter-fumadocs-integration dev`               | Prepare generated inputs and start development mode  |
| `pnpm --filter next-slug-splitter-fumadocs-integration build`             | Create a production build                            |
| `pnpm --filter next-slug-splitter-fumadocs-integration start`             | Serve the production build                           |
| `pnpm --filter next-slug-splitter-fumadocs-integration typecheck`         | Regenerate inputs and run the integration typecheck  |
| `pnpm --filter next-slug-splitter-fumadocs-integration clean`             | Remove generated Fumadocs, handler, and build output |
