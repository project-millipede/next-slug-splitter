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
cd demo
pnpm dev

# Or with TypeScript config
pnpm dev:ts
```

The `dev` script automatically:
1. Activates the selected config variant (JavaScript or TypeScript)
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

The demo supports two configuration styles to show how next-slug-splitter integrates with different project setups.

Source files live in `config-variants/`:

```
config-variants/
├── javascript/          ← .mjs files with JSDoc types
│   ├── next.config.mjs
│   ├── route-handlers-config.mjs
│   ├── component-registry.mjs
│   └── handler-processor.mjs
└── typescript/          ← .ts files with native types
    ├── next.config.ts
    ├── route-handlers-config.ts
    ├── component-registry.ts
    └── handler-processor.ts
```

Switch variants manually:

```bash
pnpm use-config:js    # activate JavaScript config
pnpm use-config:ts    # activate TypeScript config
```

The `dev`/`build` scripts handle this automatically — use `dev:ts`/`build:ts` for the TypeScript variant.

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
│   └── docs/
│       ├── [...slug].tsx    ← catch-all for light pages
│       └── _handlers/       ← auto-generated heavy page handlers
└── scripts/
    ├── generate-ballast.mjs ← creates simulated heavy dependencies
    ├── clean-handlers.mjs   ← removes generated handlers before rebuild
    └── use-config.mjs       ← activates a config variant
```
