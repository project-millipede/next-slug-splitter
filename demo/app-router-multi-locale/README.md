# next-slug-splitter App Router Demo

Minimal Next.js App Router app that demonstrates how **next-slug-splitter** separates light and heavy MDX pages into optimized route handlers — reducing client-side bundle size for pages that don't need heavy components.

## The Problem

MDX-based content sites frequently need interactive components embedded alongside prose — counters, charts, data grids, code playgrounds, and similar widgets. Because MDX compiles to React, the content route must have access to every component it might render. The natural Next.js approach is a single catch-all route that imports them all:

```tsx
// app/[locale]/docs/[...slug]/page.tsx — the conventional approach
import { Counter } from '../../components/counter'; // ~1 MB dependency
import { Chart } from '../../components/chart'; // ~3 MB dependency
import { DataTable } from '../../components/data-table'; // ~6 MB dependency

const components = { Counter, Chart, DataTable };

export default async function DocsPage() {
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

**Light pages** are served by the locale-aware catch-all
`app/[locale]/docs/[...slug]/page.tsx` with an empty loadable registry. They can
still render lightweight components from the MDX component scope, such as
`Callout`.

**Heavy pages** get auto-generated handlers in `app/docs/generated-handlers/` that import only the specific loadable components they need:

- `generated-handlers/interactive/en/page.tsx` bundles only `Counter`
- `generated-handlers/dashboard/en/page.tsx` bundles only `Chart` + `DataTable`

For the App Router path, `app/[locale]/docs/[...slug]/route-contract.ts` is shared by the public light page and the generated heavy pages:

- the light page at `app/[locale]/docs/[...slug]/page.tsx`
- generated heavy pages under `app/docs/generated-handlers/`
- the shared route contract at `app/[locale]/docs/[...slug]/route-contract.ts`

That route-owned contract owns:

- static param enumeration
- page-facing helpers (`loadPageProps`, `generatePageMetadata`)

## Quick Start

```bash
# From the repository root
pnpm install

# Start the demo with the default JavaScript config
cd demo/app-router
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

This demo is also used for local Next.js integration work. If its
`package.json` points `next` at an absolute local checkout, either use that
matching checkout or align `next`, `react`, and `react-dom` with the versions in
the root or Pages Router demo package before running the quick start elsewhere.

For the current Pages-vs-App comparison around development proxy behavior,
Pages-only quirks, and shared readiness safeguards, see
[`docs/architecture/router-behavior-matrix.md`](../../docs/architecture/router-behavior-matrix.md).

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

After starting dev or running a build, look at `app/docs/generated-handlers/`:

```text
app/docs/generated-handlers/
├── interactive
│   ├── en/page.tsx        ← imports only Counter
│   └── de/page.tsx        ← imports only Counter
└── dashboard
    ├── en/page.tsx        ← imports only Chart + DataTable
    └── de/page.tsx        ← imports only Chart + DataTable
```

These files are auto-generated and gitignored. Each one imports exactly the loadable components that its page needs — nothing more.

The preset keeps source discovery and generated output explicit:

- `contentDir: content/pages`
- derived `generatedRootDir: app/docs`

The library then derives `app/docs/generated-handlers/` internally.

### The demo target config

This demo uses the App Router catch-all preset documented in the top-level
[README](../../README.md#app-router-catch-all-targets).

The App-specific pieces are `app.localeConfig`, the dedicated
`app/[locale]/docs/[...slug]/route-contract.ts` module, and the
`pageDataCompilerImport` used by that route contract. Generated heavy pages are
emitted under `app/docs/generated-handlers/`.

The demo uses `en` and `de` with `en` as the default locale. English docs use
canonical unprefixed URLs such as `/docs/getting-started`; German docs use
prefixed URLs such as `/de/docs/getting-started`. Internally, the default
unprefixed light route rewrites to the physical `[locale]` App route.

### The catch-all route

`app/[locale]/docs/[...slug]/page.tsx` uses `withHeavyRouteFilter(...)` on
`generateStaticParams()` to exclude slugs already served by generated heavy
handlers, preventing duplicate routes. Its `loadableRegistrySubset` is empty,
so no loadable component code is bundled there.

### The route-owned contract

`app/[locale]/docs/[...slug]/route-contract.ts` is the single authored route contract.
The light page and generated heavy pages both import it so route behavior stays
owned by the route folder instead of a detached `lib/` module.

The route contract exports:

- `getStaticParams`
- `loadPageProps`
- `generatePageMetadata`
- `revalidate`

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
both attach the same runtime-trait metadata, use the same runtime-aware
handler factory, and compile the same MDX shape. The difference is only the
authoring style:

- JavaScript variant loads `config-variants/javascript/handler-processor.mjs`
  and `config-variants/javascript/content-compiler.mjs` directly
- TypeScript variant compiles `config-variants/typescript/handler-processor.ts`
  and `config-variants/typescript/content-compiler.ts` into `dist/` during the
  prepare step before runtime loads them

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

The demo also includes `app/not-found.tsx`, which uses
`useSlugSplitterNotFoundRetry(...)` from
`next-slug-splitter/next/app/proxy/not-found-retry` as a dev-only workaround
for a remaining Next/Turbopack race.

When a heavy route is emitted lazily on first request, the proxy can already
know the correct rewrite target while Next is still warming that page up. In
that narrow window the same request may still land on a transient 404. The
demo's not-found boundary probes the route for readiness and retries once
instead of immediately showing a not-found page.

This is not part of the core route-classification logic, and production builds
do not need it. It exists only to make the demo smoother while the underlying
Next/Turbopack readiness behavior remains.

For the broader Pages-vs-App comparison, including which dev-only behaviors are
Pages-specific and which belong to the shared proxy/readiness layer, see
[`docs/architecture/router-behavior-matrix.md`](../../docs/architecture/router-behavior-matrix.md).

## Project Structure

```text
.
├── app
│   ├── [locale]
│   │   ├── docs
│   │   │   └── [...slug]
│   │   │       ├── page.tsx            ← public light catch-all page
│   │   │       └── route-contract.ts   ← route-owned shared contract
│   │   └── page.tsx                    ← localized landing page
│   ├── docs
│   │   └── generated-handlers          ← auto-generated heavy page handlers
│   ├── language-switch.tsx             ← locale switch preserving the slug
│   ├── layout.tsx                      ← shared layout shell
│   ├── not-found.tsx                   ← dev-only App retry boundary
│   └── page.tsx                        ← landing page with page listing
├── config-variants                     ← source-of-truth demo variant configs
├── content/pages                       ← MDX content files
│   ├── getting-started
│   │   ├── en.mdx                      ← light English content
│   │   └── de.mdx                      ← light German content
│   ├── tutorial
│   │   ├── en.mdx                      ← light English content
│   │   └── de.mdx                      ← light German content
│   ├── interactive
│   │   ├── en.mdx                      ← heavy English content
│   │   └── de.mdx                      ← heavy German content
│   └── dashboard
│       ├── en.mdx                      ← heavy English content
│       └── de.mdx                      ← heavy German content
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
