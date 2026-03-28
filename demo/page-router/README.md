# next-slug-splitter Demo

Minimal Next.js Pages Router app that demonstrates how **next-slug-splitter** separates light and heavy MDX pages into optimized route handlers — reducing client-side bundle size for pages that don't need heavy components.

## The Problem

MDX-based content sites frequently need interactive components embedded alongside prose — counters, charts, data grids, code playgrounds, and similar widgets. Because MDX compiles to React, the content page must have access to every component it might render. The natural Next.js approach is a single catch-all route that imports them all:

```tsx
// pages/docs/[...slug].tsx — the conventional approach
import { Counter } from '../../components/counter';       // ~1 MB dependency
import { Chart } from '../../components/chart';            // ~3 MB dependency
import { DataTable } from '../../components/data-table';   // ~6 MB dependency

const components = { Counter, Chart, DataTable };

export default function DocsPage({ code }) {
  return <MdxContent code={code} components={components} />;
}
```

There is no other practical option within the Pages Router — every page served by this route shares a single bundle. Even pure-Markdown pages that never render any of these components inherit the full import graph.

With the conventional approach, this demo's build output would look like this:

| Page | Route | Bundle Size |
|---|---|---|
| Home | `/` | 127 kB |
| Getting Started | `/docs/getting-started` | **~1250 kB** |
| Tutorial | `/docs/tutorial` | **~1250 kB** |
| Interactive | `/docs/interactive` | **~1250 kB** |
| Dashboard | `/docs/dashboard` | **~1250 kB** |

Every docs page loads **~1250 kB** — the combined weight of all component dependencies — regardless of whether it actually uses any of them.

## The Solution

next-slug-splitter scans MDX content at build time, detects which pages actually reference heavy components, and generates dedicated route handlers for those pages only. Light pages continue to use the catch-all route — but with an empty component registry, so their bundle stays minimal.

The result is **per-page component scoping**: each page bundles only the components it actually uses.

### Build output with next-slug-splitter

| Page | Route | Components | Bundle Size |
|---|---|---|---|
| Home | `/` | — | 127 kB |
| Getting Started | `/docs/getting-started` | none (light) | 141 kB |
| Tutorial | `/docs/tutorial` | none (light) | 141 kB |
| Interactive | `/docs/interactive` | Counter | 266 kB |
| Dashboard | `/docs/dashboard` | Chart, DataTable | 1250 kB |

Light pages drop from ~1250 kB to **141 kB** — a ~89% reduction. The Interactive page loads only the Counter component it needs (266 kB instead of 1250 kB). Only the Dashboard page, which genuinely uses the heaviest components, pays the full cost.

The ballast files in this demo simulate realistic dependency sizes (visualization libraries, data grids) and are generated at dev/build time by `scripts/generate-ballast.mjs`.

### How it works

**Light pages** are served by the catch-all `pages/docs/[...slug].tsx` with an empty component registry — no heavy code is bundled.

**Heavy pages** get auto-generated handlers in `pages/docs/_handlers/` that import only the specific components they need:
- `_handlers/interactive.tsx` bundles only `Counter`
- `_handlers/dashboard.tsx` bundles only `Chart` + `DataTable`

## Quick Start

```bash
# From the repository root
pnpm install

# Start the demo with JavaScript config (default)
cd demo/page-router
pnpm dev

# Or with TypeScript config
pnpm dev:ts
```

The `dev` script automatically:
1. Selects the active config variant through a tiny manifest file
2. Generates ballast files (simulated heavy dependencies)
3. Cleans any previously generated handlers
4. Starts the Next.js dev server

## What to Look At

### Bundle size difference

Run a production build and inspect the output:

```bash
pnpm build
```

Compare the bundle sizes in the build output:
- **Light pages** (`getting-started`, `tutorial`) — minimal JS, no component code
- **Heavy pages** (`interactive`, `dashboard`) — include only their specific components

### Generated handlers

After starting dev or running a build, look at `pages/docs/_handlers/`:

```
pages/docs/_handlers/
├── interactive.tsx   ← imports only Counter
└── dashboard.tsx     ← imports only Chart + DataTable
```

These files are auto-generated and gitignored. Each one imports exactly the components that its page needs — nothing more.

### The catch-all route

`pages/docs/[...slug].tsx` uses `withHeavyRouteFilter` to exclude slugs that are already served by generated handlers, preventing duplicate routes. Its `loadableRegistrySubset` is empty, so no component code is bundled.

## Config Variants

The demo supports four variants across two configuration styles:
- `javascript`
- `typescript`
- `javascript-package`
- `typescript-package`

Source files live in `config-variants/`:

```
config-variants/
├── javascript/          ← .mjs files with JSDoc types
│   ├── next.config.mjs
│   ├── route-handlers-config.mjs
│   ├── component-registry.mjs
│   └── handler-processor.mjs
├── javascript-package/  ← .mjs package-exports variant
├── typescript/          ← .ts files with native types
│   ├── next.config.ts
│   ├── route-handlers-config.ts
│   ├── component-registry.ts
│   └── handler-processor.ts
└── typescript-package/  ← .ts package-exports variant
```

Use the ready-made scripts:

```bash
pnpm dev         # JavaScript module-map variant
pnpm dev:ts      # TypeScript module-map variant
pnpm dev:js-pkg  # JavaScript package-exports variant
pnpm dev:ts-pkg  # TypeScript package-exports variant

pnpm build       # Build the JavaScript module-map variant
pnpm build:ts    # Build the TypeScript module-map variant
pnpm build:js-pkg  # Build the JavaScript package-exports variant
pnpm build:ts-pkg  # Build the TypeScript package-exports variant

pnpm start       # Start the JavaScript module-map variant
pnpm start:ts    # Start the TypeScript module-map variant
pnpm start:js-pkg  # Start the JavaScript package-exports variant
pnpm start:ts-pkg  # Start the TypeScript package-exports variant
```

The root `next.config.ts` and `route-handlers-config.ts` stay stable. The active variant is derived from the current package script name through `npm_lifecycle_event`, so matching `dev:*`, `build:*`, and `start:*` scripts share the same variant suffix.

Important: `npm_lifecycle_event` is the script key that was invoked from
`package.json`, not the command body. So `build` and `build:ts` can both run
`next build`, while the stable root config still resolves different active
variants from the script name.

Example mapping:

```txt
pnpm build         -> npm_lifecycle_event = "build"         -> javascript
pnpm build:ts      -> npm_lifecycle_event = "build:ts"      -> typescript
pnpm start:js-pkg  -> npm_lifecycle_event = "start:js-pkg"  -> javascript-package
pnpm start:ts-pkg  -> npm_lifecycle_event = "start:ts-pkg"  -> typescript-package
```

## Dev 404 Retry Workaround

The demo also includes `pages/404.tsx`, which uses `useSlugSplitterNotFoundRetry(...)` from `next-slug-splitter/next/not-found` as a dev-only workaround for a remaining Next/Turbopack race.

When a heavy route is emitted lazily on first request, the proxy can already know the correct rewrite target while Next is still warming that page up. In that narrow window the same request may still land on a transient 404. The demo's 404 page probes the route for readiness and retries once instead of immediately showing a not-found page.

This is not part of the core route-classification logic, and production builds do not need it. It exists only to make the demo smoother while the underlying Next/Turbopack readiness behavior remains.

## Project Structure

```
demo/
├── config-variants/         ← source-of-truth config files (JS + TS)
├── content/pages/           ← MDX content files
│   ├── getting-started.mdx  ← light (pure Markdown)
│   ├── tutorial.mdx         ← light (pure Markdown)
│   ├── interactive.mdx      ← heavy (uses <Counter />)
│   └── dashboard.mdx        ← heavy (uses <Chart />, <DataTable />)
├── lib/
│   ├── components/          ← React components with simulated ballast
│   ├── content.ts           ← MDX file discovery and compilation
│   ├── handler-factory/     ← page component factory (variant: none)
│   └── mdx-runtime.tsx      ← client-side MDX evaluation
├── pages/
│   ├── _app.tsx             ← shared layout shell
│   ├── index.tsx            ← landing page with page listing
│   ├── 404.tsx              ← dev-only retry workaround for transient lazy-route 404s
│   └── docs/
│       ├── [...slug].tsx    ← catch-all for light pages
│       └── _handlers/       ← auto-generated heavy page handlers
└── scripts/
    ├── generate-ballast.mjs ← creates simulated heavy dependencies
    ├── clean-handlers.mjs   ← removes generated handlers before rebuild
    └── erase-generated-dev-state.mjs ← full demo reset for generated dev artifacts
```
