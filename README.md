# next-slug-splitter

> Next.js route handler generation with build-time rewrites and dev-time request routing

A configuration-driven package for analyzing content page trees, generating
route-specific handlers, and routing traffic into those handlers — either
through build-time rewrites (production) or a request-time proxy (development).

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Quick Start](#quick-start)
4. [Usage](#usage)
5. [Operation Modes](#operation-modes)
6. [Configuration Reference](#configuration-reference)
7. [Architecture](#architecture)
8. [Capabilities](#capabilities)
9. [Next.js Integration Points](#nextjs-integration-points)

## Overview

### Features

- **Two Operation Modes:** Rewrite mode for production builds, proxy mode for
  development — each optimized for its environment.
- **Config-Driven Targets:** Declare one or more route spaces such as `docs`
  and `blog` with app-level and target-level settings.
- **Build-Time Generation:** Discover content pages, resolve component metadata,
  classify heavy routes, and emit dedicated handler pages before the app build.
- **Dev-Time Proxy Routing:** A generated `proxy.ts` intercepts requests and
  delegates heavy/light routing decisions into a long-lived worker session.
- **Lazy Discovery and Reuse:** In proxy mode, heavy routes are classified on
  first request and cached under `.next/cache` for fast subsequent requests and
  dev restarts.
- **Optional Startup Prewarm:** Opt into
  `app.routing.workerPrewarm: 'instrumentation'` to bootstrap the dev worker
  during Next startup instead of waiting for the first proxied request.
- **Locale-Aware Routing:** Support for locale detection based on filenames or
  a default-locale routing model.
- **Multi-Target:** Support multi-target setups such as `docs` plus `blog` in
  one configuration file.

### Why Use It?

Content-heavy route spaces such as docs and blogs often benefit from splitting
"heavy" routes (pages with interactive components) from "light" routes (pages
with only standard markdown elements). `next-slug-splitter` manages that split:

- **In production:** `next build` generates dedicated handler pages for heavy
  routes and installs rewrites that route matching traffic into those handlers.
- **In development:** A proxy discovers heavy routes lazily on first request,
  reuses cached route-capture facts across dev restarts, and can optionally
  prewarm its worker session during startup.

The configuration lives in one app-owned file, the integration is a single
`withSlugSplitter(...)` wrapper, and the routing strategy adapts automatically
to the current Next.js phase.

### Limitations

- **MDX only** — content pages must be `.mdx` files. Standard `.tsx` / `.jsx`
  pages are not analyzed. Support for non-MDX content sources may be added later.
- **Pages Router** — currently has the fuller feature set, including the
  existing dev proxy path and the `getStaticProps` / `getStaticPaths`-based
  integration under `pages/`.
- **App Router** — catch-all page routes under `app/` support build-time
  generation plus rewrite-based routing in production, and proxy-based lazy
  routing in development through the same worker architecture as the Pages
  Router path. See
  [`docs/architecture/app-router-boundary-files.md`](docs/architecture/app-router-boundary-files.md).
  For a current Pages-vs-App behavior comparison around dev proxy quirks and
  safeguards, see
  [`docs/architecture/router-behavior-matrix.md`](docs/architecture/router-behavior-matrix.md).

## Getting Started

### Installation

```bash
npm install next-slug-splitter next
# or
pnpm add next-slug-splitter next
```

`next-slug-splitter` requires Next.js `16.2.0` or newer and installs the
stable top-level `adapterPath` option.

## Quick Start

### 1. Wrap the Next Config

```js
import { withSlugSplitter } from 'next-slug-splitter/next';

const nextConfig = {
  i18n: {
    locales: ['en', 'de'],
    defaultLocale: 'en'
  }
};

export default withSlugSplitter(nextConfig, {
  configPath: './route-handlers-config.mjs'
});
```

For single-locale Pages Router setups, omit Next `i18n` entirely. The library
normalizes the missing `i18n` block into its internal single-locale
`LocaleConfig` automatically.

### 2. Declare Route Targets

```js
// route-handlers-config.mjs
// @ts-check

import process from 'node:process';
import path from 'node:path';
import { createCatchAllRouteHandlersPreset } from 'next-slug-splitter/next';
import { routeHandlerBindings } from 'site-route-handlers/config';

const rootDir = process.cwd();

/** @type {import('next-slug-splitter/next').DynamicRouteParam} */
const docsRouteParam = {
  name: 'slug',
  kind: 'catch-all'
};

/** @type {import('next-slug-splitter/next').DynamicRouteParam} */
const blogRouteParam = {
  name: 'slug',
  kind: 'single'
};

/** @type {import('next-slug-splitter/next').RouteHandlersConfig} */
export const routeHandlersConfig = {
  app: {
    rootDir,
    routing: {
      // Default: 'proxy' in development, rewrites in production
      development: 'proxy'
    }
  },
  targets: [
    createCatchAllRouteHandlersPreset({
      routeSegment: 'docs',
      handlerRouteParam: docsRouteParam,
      contentPagesDir: path.resolve(rootDir, 'docs/src/pages'),
      handlerBinding: routeHandlerBindings.docs
    }),
    createCatchAllRouteHandlersPreset({
      routeSegment: 'blog',
      handlerRouteParam: blogRouteParam,
      contentPagesDir: path.resolve(rootDir, 'blog/src/pages'),
      contentLocaleMode: 'default-locale',
      handlerBinding: routeHandlerBindings.blog
    })
  ]
};
```

No separate generation command is required for the standard integration path.
`next build` runs route-handler generation automatically through the installed
adapter.

### App Router Catch-All Targets

Use `createAppCatchAllRouteHandlersPreset(...)` when the public catch-all route
lives under `app/` and you want the current App Router path.

```js
// route-handlers-config.mjs
// @ts-check

import process from 'node:process';
import path from 'node:path';
import {
  createAppCatchAllRouteHandlersPreset,
  relativeModule
} from 'next-slug-splitter/next';
import { routeHandlerBindings } from 'site-route-handlers/config';

const rootDir = process.cwd();

/** @type {import('next-slug-splitter/next').DynamicRouteParam} */
const docsRouteParam = {
  name: 'slug',
  kind: 'catch-all'
};

/** @type {import('next-slug-splitter/next').RouteHandlersConfig} */
export const routeHandlersConfig = {
  routerKind: 'app',
  app: {
    rootDir
  },
  targets: [
    createAppCatchAllRouteHandlersPreset({
      routeSegment: 'docs',
      handlerRouteParam: docsRouteParam,
      contentPagesDir: path.resolve(rootDir, 'content/pages'),
      contentLocaleMode: 'default-locale',
      routeModuleImport: relativeModule('app/docs/[...slug]/route-contract'),
      handlerBinding: {
        ...routeHandlerBindings.docs,
        pageDataCompilerImport: relativeModule(
          'config-variants/javascript/content-compiler.mjs'
        )
      }
    })
  ]
};
```

The App-specific fields are:

- `routeModuleImport` — the route-owned contract imported by the light App page
  and generated heavy pages
- `handlerBinding.pageDataCompilerImport` — the app-owned compiler module that
  the library executes in an isolated worker for page-data compilation
- `app.localeConfig` — optional multi-locale semantics used for App-side
  worker routing and static-param filtering
- `routeTreeSegment` — optional filesystem subtree for the emitted App handler
  branch; use this when the App route tree includes route groups

`app.localeConfig` is a library routing contract, not a direct mirror of
Next.js `i18n` settings:

- omit `app.localeConfig` for single-locale App Router setups
- provide `app.localeConfig` only for multi-locale App Router setups
- `locales` lists every locale identity the library should reason about
- `defaultLocale` must be included in `locales`

If the App tree uses a route group, keep the public route path stable through
`routeSegment` and place the generated handlers under the shared subtree through
`routeTreeSegment`:

```js
createAppCatchAllRouteHandlersPreset({
  routeSegment: 'docs',
  routeTreeSegment: 'docs/(docs-shared)',
  handlerRouteParam: docsRouteParam,
  contentPagesDir: path.resolve(rootDir, 'content/pages'),
  routeModuleImport: relativeModule('app/docs/[...slug]/route-contract'),
  handlerBinding: {
    ...routeHandlerBindings.docs,
    pageDataCompilerImport: relativeModule(
      'config-variants/javascript/content-compiler.mjs'
    )
  }
});
```

That shape produces:

- public route base path: `/docs`
- generated handler subtree: `app/docs/(docs-shared)/generated-handlers/...`

## Usage

### Module References for Shared Packages

If your processors, factories, or component registries already live behind
package exports, use `packageModule(...)` early instead of building manual
filesystem paths into your route-handler config.

This is especially useful in processors:

- the package manager and Node resolve the shared package through
  `node_modules`
- the processor does not need to maintain app-specific absolute or relative
  paths for shared component modules
- the same package export can be reused from both `handlerBinding` and
  `componentImport.source`

For workspace packages, `packageModule(...)` only works when the package is
reachable through the app's `node_modules` resolution path, which usually means
declaring it in the root app `package.json` so the workspace package is hoisted
or otherwise installed where Node can resolve it. A complete processor example
appears in Step 3 below.

### 1. Wrap the Next Config

`withSlugSplitter(nextConfigExport, options)` resolves the app-owned route
handlers config and installs the adapter entry into `adapterPath`.

Two registration modes:

```js
// File-based (recommended for most apps)
withSlugSplitter(nextConfig, {
  configPath: './route-handlers-config.mjs'
});

// Direct object (useful for monorepos or programmatic setups)
withSlugSplitter(nextConfig, {
  routeHandlersConfig: myConfig
});
```

### 2. Declare Route Targets

The route handlers config is the app-owned source of truth for route handler
generation. A target typically describes:

- the public route segment such as `docs` or `blog`
- the dynamic route parameter kind
- the content page directory
- the binding that provides the processor module for route planning

`createCatchAllRouteHandlersPreset(...)` is the shortest way to configure
catch-all targets without hand-assembling all path values.

### 3. Wire `handlerBinding` and the Processor

The handler binding tells the library which processor module to load:

```ts
{
  handlerBinding: {
    processorImport: relativeModule('lib/handler-processor')
  }
}
```

The processor is the single source of truth for component imports and factory
selection. It is exported from the module referenced by `processorImport`.

This is also a common place to use `packageModule(...)` for shared component
registries or UI packages, because the processor can rely on package exports
instead of maintaining manual filesystem paths to those component modules.

```ts
import { packageModule, relativeModule } from 'next-slug-splitter/next';

const componentsModule = packageModule('@site/components');

export const routeHandlersConfig = {
  app: {
    rootDir
  },
  targets: [
    {
      handlerBinding: {
        processorImport: packageModule('site-route-handlers/docs/processor')
      }
    }
  ]
};

export const routeHandlerProcessor = {
  resolve({ capturedComponentKeys }) {
    // Gather what you need — registry lookups, metadata, etc. — and return
    // the final generation plan directly.
    const componentEntriesByKey =
      resolveComponentsByCapturedKey(capturedComponentKeys);

    return {
      factoryImport: relativeModule('lib/handler-factory/runtime'),
      components: capturedComponentKeys.map(key => {
        const entry = componentEntriesByKey[key];
        return {
          key,
          componentImport: {
            source: componentsModule,
            kind: 'named',
            importedName: entry.exportName
          }
        };
      })
    };
  }
};
```

- **`resolve`** — produce the generation plan for one heavy route. Implementations can still use private local helpers to gather registry data, metadata, or config before returning the final plan.

A TypeScript helper `defineRouteHandlerProcessor(...)` is available for
type inference:

```ts
import { defineRouteHandlerProcessor } from 'next-slug-splitter/next';

export const routeHandlerProcessor = defineRouteHandlerProcessor({
  resolve({ capturedComponentKeys, route }) { ... }
});
```

### 4. Generate or Analyze (Optional CLI)

The standalone CLI generates handler artifacts or runs analysis only.
Unlike the Next adapter, it does not derive inputs from a discovered Next
config. Pass the route-handlers config module path plus explicit locale
semantics.

Required flags:

- `--route-handlers-config-path` — path to the route-handlers config module
- `--locales` — comma-separated locale list
- `--default-locale` — default locale and member of `--locales`

Optional flags:

- `--analyze-only` — skip handler emission and report what would be generated
- `--json` — emit a machine-readable array of per-target results

```bash
pnpm exec tsx ./node_modules/next-slug-splitter/dist/cli.js \
  --route-handlers-config-path ./route-handlers-config.ts \
  --locales en,de \
  --default-locale en \
  --analyze-only

node ./node_modules/next-slug-splitter/dist/cli.js \
  --route-handlers-config-path ./route-handlers-config.mjs \
  --locales en,de \
  --default-locale en \
  --json
```

The human-readable output prints one summary line per configured target.
`--json` emits the same per-target results as an array.

1. Use `tsx` when the route-handlers config module is TypeScript, for example `.ts`.
2. Use plain `node` when the route-handlers config module is JavaScript, for example `.mjs`.

> In development with proxy mode, the CLI step is not needed. The proxy
> discovers routes on demand.

## Operation Modes

### Rewrite Mode (Production Default)

Used during `PHASE_PRODUCTION_BUILD` and `PHASE_PRODUCTION_SERVER`.

1. The build analyzes content pages and generates dedicated handler page files
2. The adapter injects rewrites into the Next config (`beforeFiles`)
3. Next.js routes matching traffic to the generated handler pages

All routes are resolved upfront at build time. The generated handler pages and
rewrites are static artifacts.

### Proxy Mode (Development Default)

Used during `PHASE_DEVELOPMENT_SERVER`.

1. The adapter generates a thin `proxy.ts` file at the app root
2. It also writes a structural worker bootstrap manifest to
   `.next/cache/route-handlers-worker-bootstrap.json`
3. `proxy.ts` intercepts page requests matching configured route base paths
4. A long-lived worker session classifies unknown routes on demand
5. Heavy routes are rewritten to their generated handler pages; light routes
   pass through to the catch-all page
6. Stage 1 route-capture facts are cached per target under
   `.next/cache/route-handlers-lazy-single-routes/`

Benefits over rewrite mode in development:

- **Instant startup** — no upfront generation pass
- **On-demand discovery** — only routes actually visited are classified
- **Cross-restart reuse** — emitted handlers and lazy route-capture facts can
  be reused across dev restarts while development remains the owning phase

#### Optional Worker Prewarm

When development routing uses `'proxy'`, you can ask the library to bootstrap
the long-lived worker session during Next startup:

```js
// In route-handlers-config.mjs
export const routeHandlersConfig = {
  app: {
    routing: {
      development: 'proxy',
      workerPrewarm: 'instrumentation'
    }
  },
  targets: [...]
};
```

When enabled, `next-slug-splitter` generates a tiny root `instrumentation.ts`
file that imports
`prewarmRouteHandlerProxyWorker` from
`next-slug-splitter/next/instrumentation`. This is a best-effort startup
prewarm of the current worker session only. It does not classify routes, emit
handlers, or warm specific pages ahead of traffic.

If your app already owns `instrumentation.ts` or `instrumentation.js` at the
root or under `src/`, the library refuses to overwrite it. Leave
`workerPrewarm` set to `'off'` in that case.

#### Dev-Mode Cold-Start Behavior

The lazy proxy path is self-healing in development:

1. The worker determines whether the requested route is light or heavy.
2. If the route is heavy, it checks whether the emitted handler file already exists.
3. If the file already exists, it is reused and not regenerated.
4. If the file is missing, the worker emits that single handler on demand.
5. The rewrite is then resolved within the same request cycle.

This means a missing heavy-route handler can be recreated on first request
without a separate generation step, while an existing handler is reused as-is.

Handler generation is therefore self-healing, but development can still hit a
narrow Next/Turbopack warm-up window where the proxy already knows the correct
handler destination while the emitted page is not fully ready yet. During that
window, the browser can briefly land on a transient 404 for a catch-all route.

To smooth that development-only case, add a custom `pages/404.*` page that uses
the dedicated not-found helper:

```tsx
import type { NextPage } from 'next';

import { useSlugSplitterNotFoundRetry } from 'next-slug-splitter/next/not-found-retry';

const CATCH_ALL_ROUTE_PREFIXES = ['/docs/', '/blog/'];

const NotFound: NextPage = () => {
  const isNotFoundConfirmed = useSlugSplitterNotFoundRetry({
    catchAllRoutePrefixes: CATCH_ALL_ROUTE_PREFIXES
  });

  if (!isNotFoundConfirmed) {
    return null;
  }

  return <h1>Page Not Found</h1>;
};

export default NotFound;
```

This hook is a no-op outside development, so production builds still render
their normal 404 page immediately.

##### Next.js Client-Side Page Manifest Patch

In dev mode, Next.js caches the page manifest on the client side. When a handler
page is lazily emitted after the manifest was cached, the client-side router does
not know the page exists and may fail the navigation. To fix this, apply the
included patch that adds manifest refresh on rewrite miss:

```json
{
  "pnpm": {
    "patchedDependencies": {
      "next@16.2.0": "patches/next@16.2.0.patch"
    }
  }
}
```

The patch modifies `page-loader.js` to accept a `refresh` parameter and
`router.js` to re-fetch the dev pages manifest when a proxy rewrite targets
a page not yet in the cached page list. This fix has been proposed upstream
in [vercel/next.js#91760](https://github.com/vercel/next.js/pull/91760) and
the local patch can be removed once it lands. This is only relevant in
development; production builds pre-compile all handler pages.

### Configuring the Routing Policy

The development routing mode defaults to `'proxy'`, and worker prewarm defaults
to `'off'`. To override:

```js
// In route-handlers-config.mjs
export const routeHandlersConfig = {
  app: {
    routing: {
      development: 'rewrites',
      workerPrewarm: 'off'
    }
  },
  targets: [...]
};
```

Environment variable override (takes precedence over config):

```bash
NEXT_SLUG_SPLITTER_DEV_ROUTING=proxy     # Force proxy mode
NEXT_SLUG_SPLITTER_DEV_ROUTING=rewrites  # Force rewrite mode
```

`NEXT_SLUG_SPLITTER_DEV_ROUTING` controls only the development routing mode.
`workerPrewarm` accepts `'off'` or `'instrumentation'` and only applies when
development routing resolves to `'proxy'`.

## Configuration Reference

### `withSlugSplitter(nextConfigExport, options)`

Wrap one Next config export and register the route handlers config.

| Option | Description |
|--------|-------------|
| `configPath` | Path to the app-owned `route-handlers-config` module |
| `routeHandlersConfig` | Direct config object (alternative to `configPath`) |

### `RouteHandlersConfig`

Top-level configuration shape.

| Property | Description |
|----------|-------------|
| `app.rootDir` | Application root directory |
| `app.routing.development` | Development routing mode: `'proxy'` (default) or `'rewrites'` |
| `app.routing.workerPrewarm` | Dev-only worker startup strategy: `'off'` (default) or `'instrumentation'` |
| `app.prepare` | Optional TypeScript prepare step or steps run before route planning |
| `targets` | Array of target configurations |

When a processor or registry needs a local TypeScript build before runtime
loading, configure `app.prepare` as one object or an ordered array of objects:

```js
app: {
  rootDir,
  prepare: [
    {
      tsconfigPath: relativeModule('tsconfig.processor.json')
    }
  ]
}
```

If you only need one prepare step, a single object is also accepted. If no
pre-build is needed, omit `app.prepare`.

`app.routing.workerPrewarm` only affects development proxy mode. When set to
`'instrumentation'`, the library generates a root `instrumentation.ts` bridge
that prewarms the current proxy worker session. Existing app-owned
`instrumentation.ts` / `instrumentation.js` files at the root or under `src/`
are treated as conflicts and are never overwritten.

### `createCatchAllRouteHandlersPreset(options)`

Create one catch-all target with normalized route and path values.

| Option | Description |
|--------|-------------|
| `routeSegment` | Public route segment (e.g. `'docs'`, `'blog'`) |
| `handlerRouteParam` | Dynamic route parameter configuration |
| `contentPagesDir` | Directory containing content pages |
| `generatedRootDir` | Derived generated-output root; presets resolve this from `routeSegment` |
| `handlerBinding` | Binding with processor module for route planning |
| `contentLocaleMode` | Locale detection mode (see below) |

### `createAppCatchAllRouteHandlersPreset(options)`

Create one App Router catch-all target with normalized public route values and
App-specific route-module inputs.

| Option | Description |
|--------|-------------|
| `routeSegment` | Public route segment (e.g. `'docs'`) |
| `routeTreeSegment` | Optional App Router filesystem subtree for emitted handlers; defaults to `routeSegment` |
| `handlerRouteParam` | Dynamic route parameter configuration |
| `contentPagesDir` | Directory containing content pages |
| `generatedRootDir` | Derived generated-output root; presets resolve this from `routeSegment` or `routeTreeSegment` |
| `handlerBinding` | Binding with processor module for route planning |
| `routeModuleImport` | Page-safe App route module imported by the light page and generated heavy pages |
| `routeModuleRuntimeImport` | Optional worker-owned App route module loaded whenever the library executes the route contract outside Next's server graph; defaults to `routeModuleImport` |
| `contentLocaleMode` | Locale detection mode (see below) |

### `DynamicRouteParam`

Supported `kind` values:

- `single` — matches a single path segment
- `catch-all` — matches one or more path segments
- `optional-catch-all` — matches zero or more path segments

### Module References

Several config fields use module-reference helpers instead of raw strings.

| Helper | Use when |
|--------|----------|
| `relativeModule('lib/handler-processor')` | The file lives under the app root and should resolve relative to `app.rootDir` |
| `packageModule('site-route-handlers/docs/processor')` | The module is exposed through package exports in `node_modules`, including hoisted workspace packages |
| `absoluteModule('/abs/path/to/module')` | The file lives outside the app root and outside reachable package exports |

See the Usage section above for a complete `packageModule(...)` example in both
`handlerBinding.processorImport` and processor-side component imports.

### `handlerBinding`

The handler binding tells the library which processor module to load.

```ts
{
  processorImport: relativeModule('lib/handler-processor')
}
```

See the Usage section above for a worked processor example.

### Processor (`RouteHandlerProcessor`)

A processor is a route-local transformer the library calls once per heavy route.
It is exported from the module referenced by `processorImport`.

- **`resolve`** — produce the generation plan for one heavy route. Implementations can still use private local helpers to gather registry data, metadata, or config before returning the final plan.

A TypeScript helper `defineRouteHandlerProcessor(...)` is available for
type inference:

```ts
import { defineRouteHandlerProcessor } from 'next-slug-splitter/next';

export const routeHandlerProcessor = defineRouteHandlerProcessor({
  resolve({ capturedComponentKeys, route }) { ... }
});
```

### `contentLocaleMode`

Supported modes:

- `filename` — locale is encoded in the content file naming scheme
- `default-locale` — the default locale omits the locale prefix in the
  public route space

## Architecture

### Adapter

The adapter (`adapterPath`) is the entry point for Next.js integration. It
runs during the relevant Next.js phases and coordinates:

- Routing strategy selection (rewrite vs. proxy)
- App-owned preparation and config resolution
- Phase-local artifact ownership for dev versus build
- Rewrite injection or generated `proxy.ts` / `instrumentation.ts` bridges

### Runtime Reuse

The runtime keeps reuse narrowly scoped to the artifacts it actually owns:

- **Phase ownership record** — `.next/cache/route-handlers-phase-owner.json`
  separates dev-owned and build-owned generated state so the two phases do not
  trust each other's handlers or caches
- **Proxy bootstrap manifest** —
  `.next/cache/route-handlers-worker-bootstrap.json` persists only the
  structural target data the parent proxy runtime and worker need to share
- **Lazy single-route cache** —
  `.next/cache/route-handlers-lazy-single-routes/` stores per-target Stage 1
  MDX capture facts via `file-entry-cache`, enabling safe cross-restart reuse
  in development

### Proxy File Lifecycle

In proxy mode, the adapter generates a thin `proxy.ts` bridge file at the app
root. This file:

- Imports the library-owned proxy runtime
- Embeds static matchers for configured route base paths and locales
- Is automatically created when entering proxy mode and cleaned up when leaving

The generated file is marked with an ownership marker so it can be distinguished
from user-authored proxy files.

Existing app-owned `proxy.ts`, `proxy.js`, `middleware.ts`, or `middleware.js`
files at the root or under `src/` are treated as hard conflicts. The library
does not overwrite framework-owned routing entrypoints.

### Instrumentation File Lifecycle

When `app.routing.workerPrewarm === 'instrumentation'` and development uses
proxy mode, the adapter also generates a tiny root `instrumentation.ts` bridge.
That file is removed again when prewarm is turned off or proxy mode is no
longer active. Existing app-owned instrumentation files are treated as hard
conflicts and are never overwritten or deleted.

### Worker Process

In proxy mode, route classification happens in a child worker process. This is
necessary because the proxy runtime environment cannot dynamically import
app-owned configuration modules. The parent process keeps only lightweight
bootstrap state and route-base matchers; the worker reconstructs planner state
from the persisted bootstrap manifest, reuses one long-lived session per
bootstrap generation, and returns lazy route classifications on demand.

## Capabilities

- Two operation modes optimized for their respective environments
- Standalone CLI with explicit route-handlers config and locale semantics
- Lazy on-demand route discovery in development
- Cross-restart dev reuse through persisted bootstrap and lazy single-route
  caches under `.next/cache`
- Optional dev-only `instrumentation.ts` worker prewarm
- Phase-local artifact ownership that avoids dev/build cache contamination
- Install rewrite integration without mutating the incoming Next config object
- Resolve app-level and target-level route handler config in one shared shape
- Discover content pages and generate handler artifacts per target
- Reuse handler bindings for processor-driven route planning
- Support multi-target setups such as `docs` plus `blog`
- Locale-aware routing with configurable detection modes
- Phase-aware behavior — only active during development, build, and production server phases

## Next.js Integration Points

| Next.js API | Purpose |
|---|---|
| `adapterPath` | Adapter entry point — hooks into Next.js config resolution |
| `rewrites()` → `beforeFiles` | Routes heavy-page traffic to generated handlers in production |
| `proxy.ts` (root file) | Intercepts and classifies requests on demand in development; existing `proxy.*` or `middleware.*` files at the root or under `src/` are treated as conflicts |
| `instrumentation.ts` (root file) | Optional dev-only worker-session prewarm when `workerPrewarm: 'instrumentation'` is enabled |
| Phase constants | Selects rewrite mode (build/serve) or proxy mode (dev) |
