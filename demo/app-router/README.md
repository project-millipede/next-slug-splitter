# next-slug-splitter App Router Demo

Minimal Next.js App Router app that demonstrates how **next-slug-splitter** separates light and heavy MDX pages into optimized route handlers while keeping one route-owned contract beside the public catch-all page.

## The Problem

MDX-based content sites frequently need interactive components embedded alongside prose — counters, charts, data grids, code playgrounds, and similar widgets. Because MDX compiles to React, the content route must have access to every component it might render. The natural Next.js approach is a single catch-all route that imports them all:

```tsx
// app/docs/[...slug]/page.tsx — the conventional approach
import { Counter } from '../../components/counter';
import { Chart } from '../../components/chart';
import { DataTable } from '../../components/data-table';

const components = { Counter, Chart, DataTable };

export default async function DocsPage() {
  return <MdxContent code={code} components={components} />;
}
```

That makes every docs page share one component surface. Even pure-Markdown pages that never render these components inherit the full import graph.

## The Solution

next-slug-splitter scans MDX content at build time, detects which pages actually reference heavy components, and generates dedicated handler pages for those routes only. Light pages continue to use the catch-all route — but with an empty component registry, so their bundle stays minimal.

For the App Router path, both sides delegate to one route-owned contract:

- the light page at `app/docs/[...slug]/page.tsx`
- generated heavy pages under `app/docs/generated-handlers/`
- the shared route contract at `app/docs/[...slug]/route-contract.ts`

That route-owned contract owns:

- static param enumeration
- page-facing helpers (`loadPageProps`, `generatePageMetadata`)

This is intentionally aligned to the Pages worker principle:

- workers own request routing, one-file analysis, one-file emission, and rewrite readiness
- workers do not own App page semantics
- public pages and generated heavy pages call the route contract directly
- App page data is loaded directly through the route contract and the isolated
  page-data compiler worker

## Quick Start

```bash
# From the repository root
pnpm install

# Start the demo with the default JavaScript config
cd demo/app-router
pnpm dev

# Optional: exercise the TypeScript processor config instead
pnpm dev:ts
```

The default `dev` script automatically:

1. Selects the JavaScript variant
2. Generates ballast files (simulated heavy dependencies)
3. Starts the Next.js dev server

Use `pnpm dev:ts` if you want to run the same demo through the optional
TypeScript processor variant instead.

For the current Pages-vs-App comparison around development proxy behavior,
Pages-only quirks, and shared readiness safeguards, see
[`docs/architecture/router-behavior-matrix.md`](../../docs/architecture/router-behavior-matrix.md).

## What to Look At

### Generated handlers

After starting dev or running a build, look at `app/docs/generated-handlers/`:

```text
app/docs/generated-handlers/
├── interactive/page.tsx   ← imports only Counter
└── dashboard/page.tsx     ← imports only Chart + DataTable
```

These files are auto-generated and gitignored. Each one imports exactly the components that its page needs — nothing more.

The preset keeps source discovery and generated output explicit:
- `contentDir: content/pages`
- derived `generatedRootDir: app/docs`

The library then derives `app/docs/generated-handlers/` internally.

### The demo target config

The App demo now uses `createAppCatchAllRouteHandlersPreset(...)`, so the target
config stays close to the Pages Router demo while still making the route-owned
contract explicit.

Conceptually, the target looks like this:

```ts
createAppCatchAllRouteHandlersPreset({
  routeSegment: 'docs',
  handlerRouteParam: { name: 'slug', kind: 'catch-all' },
  contentDir: path.join(rootDir, 'content', 'pages'),
  contentLocaleMode: 'default-locale',
  routeModuleImport: relativeModule('app/docs/[...slug]/route-contract'),
  handlerBinding: {
    processorImport: relativeModule('dist/handler-processor'),
    pageDataCompilerImport: relativeModule(
      'config-variants/javascript/content-compiler.mjs'
    )
  }
});
```

The preset derives the repetitive App target plumbing for the demo:

- `targetId`
- `routeBasePath`
- generated App handler params always use `handlerRouteParam.name`
- `contentDir` as the source MDX/content root
- `generatedRootDir` as `app/docs`

The App-specific route contract stays explicit:

- `routeModuleImport` is the route-owned contract imported by the light page
  and generated heavy pages
- `handlerBinding.pageDataCompilerImport` points at the app-owned compiler
  module that the library executes in an isolated worker
- omitting `routeHandlersConfig.app.localeConfig` keeps the demo in
  single-locale mode

The demo uses:

```ts
app: {
  rootDir;
}
```

That does not remove locale semantics internally. The library normalizes
single-locale App Router setups to a private internal locale identity so
worker-side routing and static-param filtering can still reason about locale
without exposing a synthetic public locale code.

The underlying compilation architecture is described in
`docs/architecture/content-compilation.md`.

### The catch-all route

`app/docs/[...slug]/page.tsx` uses `withHeavyRouteFilter(...)` on
`generateStaticParams()` to exclude slugs already served by generated heavy
handlers, preventing duplicate routes. Its `loadableRegistrySubset` is empty,
so no heavy component code is bundled there.

### The route-owned contract

`app/docs/[...slug]/route-contract.ts` is the single authored route contract.
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

Both center on the same package boundary:

```js
const componentsModule = packageModule('@demo/components');
```

Every captured component key already maps to a named export from that workspace
package, so the processor can emit direct package imports without maintaining a
local module registry.

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

## Project Structure

```text
.
├── app/
│   ├── layout.tsx          ← shared layout shell
│   ├── page.tsx            ← landing page with page listing
│   ├── not-found.tsx       ← app-router not-found boundary
│   └── docs/
│       ├── [...slug]/
│       │   ├── page.tsx          ← public light catch-all page
│       │   └── route-contract.ts ← route-owned shared contract
│       └── generated-handlers/ ← auto-generated heavy page handlers
├── config-variants/        ← source-of-truth demo variant configs
├── content/pages/          ← MDX content files
├── lib/
│   ├── components/         ← React components with simulated ballast
│   ├── content.ts                 ← page-safe typed content discovery helpers
│   ├── handler-factory/    ← shared page component factory
│   └── mdx-runtime.tsx     ← MDX evaluation runtime
├── config-variants/
│   ├── javascript/
│   │   ├── handler-processor.mjs  ← JS handler processor loaded directly
│   │   └── content-compiler.mjs   ← JS page-data compiler loaded directly
│   └── typescript/
│       ├── handler-processor.ts   ← TS handler processor prepared to `dist/`
│       └── content-compiler.ts    ← TS page-data compiler prepared to `dist/`
└── scripts/
    ├── generate-ballast.mjs ← creates simulated heavy dependencies
    ├── clean-handlers.mjs   ← removes generated handlers before rebuild
    └── erase-generated-dev-state.mjs ← full demo reset for generated dev artifacts
```
