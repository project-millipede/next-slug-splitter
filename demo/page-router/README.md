# next-slug-splitter Pages Router Demo

Minimal Next.js Pages Router app that demonstrates how **next-slug-splitter** separates light and heavy MDX pages into optimized route handlers — reducing client-side bundle size for pages that don't need heavy components.

## The Problem

MDX-based content sites frequently need interactive components embedded alongside prose — counters, charts, data grids, code playgrounds, and similar widgets. Because MDX compiles to React, the content page must have access to every component it might render. The natural Next.js approach is a single catch-all route that imports them all:

```tsx
// pages/docs/[...slug].tsx — the conventional approach
import { Counter } from '../../components/counter'; // ~1 MB dependency
import { Chart } from '../../components/chart'; // ~3 MB dependency
import { DataTable } from '../../components/data-table'; // ~6 MB dependency

const components = { Counter, Chart, DataTable };

export default function DocsPage({ code }) {
  return <MdxContent code={code} components={components} />;
}
```

That makes every docs page share one component surface. Even pure-Markdown pages that never render any of these components inherit the full import graph.

With the conventional approach, this demo's build output would look roughly
like this. The exact numbers are illustrative and can move with Next.js,
React, and the generated ballast files:

| Page            | Route                   | Bundle Size  |
| --------------- | ----------------------- | ------------ |
| Home            | `/`                     | 127 kB       |
| Getting Started | `/docs/getting-started` | **~1250 kB** |
| Tutorial        | `/docs/tutorial`        | **~1250 kB** |
| Interactive     | `/docs/interactive`     | **~1250 kB** |
| Dashboard       | `/docs/dashboard`       | **~1250 kB** |

Every docs page loads **~1250 kB** — the combined weight of all component dependencies — regardless of whether it actually uses any of them.

## The Solution

next-slug-splitter scans MDX content at build time, filters captured component names through the app-owned loadable key set, and generates dedicated handlers only for pages that need generated handler imports. Light pages continue to use the catch-all route — but with an empty loadable registry, so their bundle stays minimal.

The result is **per-page component scoping**: each page bundles only the loadable components it actually uses.

### Example build output with next-slug-splitter

| Page            | Route                   | Generated Imports             | Illustrative Bundle Size |
| --------------- | ----------------------- | ----------------------------- | ------------------------ |
| Home            | `/`                     | —                             | 127 kB                   |
| Getting Started | `/docs/getting-started` | none                          | 141 kB                   |
| Tutorial        | `/docs/tutorial`        | none (`Callout` in MDX scope) | 141 kB                   |
| Interactive     | `/docs/interactive`     | Counter                       | 266 kB                   |
| Dashboard       | `/docs/dashboard`       | Chart, DataTable              | 1250 kB                  |

The important signal is the shape of the result: light pages no longer inherit
the heavy component graph, intermediate pages pay only for the components they
use, and only the genuinely heavy page pays the full cost.

The ballast files in this demo simulate realistic dependency sizes (visualization libraries, data grids) and are generated at dev/build time by `scripts/generate-ballast.mjs`.

### How it works

**Light pages** are served by the catch-all `pages/docs/[...slug].tsx` with an empty loadable registry. They can still render lightweight components from the MDX component scope, such as `Callout`.

**Heavy pages** get auto-generated handlers in `pages/docs/generated-handlers/` that import only the specific loadable components they need:

- `generated-handlers/interactive.tsx` bundles only `Counter`
- `generated-handlers/dashboard.tsx` bundles only `Chart` + `DataTable`

## Quick Start

```bash
# From the repository root
pnpm install

# Start the demo with the default JavaScript config
cd demo/page-router
pnpm dev

# Optional: exercise the TypeScript variant instead
pnpm dev:ts
```

The default `dev` script automatically:

1. Selects the JavaScript variant
2. Generates ballast files (simulated heavy dependencies)
3. Starts the Next.js dev server

Use `pnpm dev:ts` if you want to run the same demo through the optional
TypeScript variant instead.

This demo stays single-locale by omitting Next `i18n` entirely. In the current
library model, single-locale Pages Router setups should not configure `i18n`;
multi-locale Pages Router setups still use Next's normal `i18n` block.

## What to Look At

### Bundle size difference

Run a production build and inspect the output:

```bash
pnpm build

# Optional: build the TypeScript variant instead
pnpm build:ts
```

Compare the bundle sizes in the build output:

- **Light pages** (`getting-started`, `tutorial`) — minimal JS, no loadable component code
- **Heavy pages** (`interactive`, `dashboard`) — include only their specific components

### Generated handlers

After starting dev or running a build, look at `pages/docs/generated-handlers/`:

```
pages/docs/generated-handlers/
├── interactive.tsx   ← imports only Counter
└── dashboard.tsx     ← imports only Chart + DataTable
```

These files are auto-generated and gitignored. Each one imports exactly the loadable components that its page needs — nothing more.

### The catch-all route

`pages/docs/[...slug].tsx` uses `withHeavyRouteFilter` to exclude slugs that are already served by generated handlers, preventing duplicate routes. Its `loadableRegistrySubset` is empty, so no loadable component code is bundled.

In the Pages Router path, that same catch-all page module is also the route
contract. Generated heavy handlers reuse its `getStaticProps` contract instead
of importing a separate dedicated `route-contract` file. Route enumeration
still stays on that catch-all page through `getStaticPaths`.

The demo config points `routeContract` directly at that same file:
`pages/docs/[...slug].tsx`.

For the full Pages-vs-App route-contract comparison, see the comparison table
in the top-level [README](../../README.md).

## Advanced Scope

Nested MDX imports are supported by default, including cases where a parent
MDX file imports child MDX content that uses heavy components.

This demo intentionally keeps the content examples flat and does not
demonstrate nested MDX resolution so the main light-versus-heavy routing story
stays small.

## Handler Processor

The default demo path uses `config-variants/javascript/`.
An optional TypeScript authoring variant lives in
`config-variants/typescript/`.

Both center on the same loadable package boundary:

```js
const componentsModule = packageModule('@demo/components');
```

Loadable components that may be emitted into generated handlers live behind the
`@demo/components` package boundary. Captured names outside that set, such as
`Callout`, are provided through the MDX component scope and are not emitted into
generated handlers.

The JavaScript and TypeScript variants stay behaviorally aligned:
both attach the same runtime-trait metadata and use the same runtime-aware
handler factory. The difference is only the authoring style and the TypeScript
prepare step.

Use the ready-made scripts:

```bash
pnpm dev       # Start the default JavaScript variant
pnpm build     # Build the default JavaScript variant
pnpm start     # Start the default JavaScript variant

pnpm dev:ts    # Optional: start the TypeScript variant
pnpm build:ts  # Optional: build the TypeScript variant
pnpm start:ts  # Optional: start the TypeScript variant
```

The root `next.config.ts` and `route-handlers-config.ts` stay stable. The
active variant is derived from the current package script name through
`npm_lifecycle_event`, so `dev`, `build`, and `start` select the JavaScript
variant by default, while `dev:ts`, `build:ts`, and `start:ts` select the
optional TypeScript variant.

## Dev 404 Retry Workaround

The demo also includes `pages/404.tsx`, which uses `useSlugSplitterNotFoundRetry(...)` from `next-slug-splitter/next/not-found-retry` as a dev-only workaround for a remaining Next/Turbopack race.

When a heavy route is emitted lazily on first request, the proxy can already know the correct rewrite target while Next is still warming that page up. In that narrow window the same request may still land on a transient 404. The demo's 404 page probes the route for readiness and retries once instead of immediately showing a not-found page.

This is not part of the core route-classification logic, and production builds do not need it. It exists only to make the demo smoother while the underlying Next/Turbopack readiness behavior remains.

For the broader Pages-vs-App comparison, including which dev-only behaviors are
Pages-specific and which belong to the shared proxy/readiness layer, see
[`docs/architecture/router-behavior-matrix.md`](../../docs/architecture/router-behavior-matrix.md).

## Project Structure

```text
.
├── pages
│   ├── docs
│   │   ├── generated-handlers          ← auto-generated heavy page handlers
│   │   └── [...slug].tsx               ← public light catch-all page
│   ├── 404.tsx                         ← dev-only retry workaround for transient lazy-route 404s
│   ├── _app.tsx                        ← shared layout shell
│   └── index.tsx                       ← landing page with page listing
├── config-variants                     ← source-of-truth demo variant configs
├── content/pages                       ← MDX content files
│   ├── getting-started.mdx             ← light (pure Markdown)
│   ├── tutorial.mdx                    ← light (uses <Callout /> from MDX scope)
│   ├── interactive.mdx                 ← heavy (uses <Counter />)
│   └── dashboard.mdx                   ← heavy (uses <Chart />, <DataTable />)
├── lib
│   ├── components                      ← React components with simulated ballast
│   ├── handler-factory                 ← shared page component factory
│   ├── content.ts                      ← content discovery helpers
│   └── mdx-runtime.tsx                 ← client-side MDX evaluation runtime
└── scripts
    ├── generate-ballast.mjs            ← creates simulated heavy dependencies
    ├── clean-handlers.mjs              ← removes generated handlers before rebuild
    └── erase-generated-dev-state.mjs   ← full demo reset for generated dev artifacts
```
