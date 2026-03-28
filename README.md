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
  makes heavy/light routing decisions on demand — no upfront generation needed.
- **Lazy Discovery:** In proxy mode, heavy routes are classified on first
  request via a worker process and cached for subsequent requests.
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
  avoiding regeneration on every content change and enabling instant dev startup.

The configuration lives in one app-owned file, the integration is a single
`withSlugSplitter(...)` wrapper, and the routing strategy adapts automatically
to the current Next.js phase.

### Limitations

- **MDX only** — content pages must be `.mdx` files. Standard `.tsx` / `.jsx`
  pages are not analyzed. Support for non-MDX content sources may be added later.
- **Pages Router only** — relies on `getStaticProps`, `getStaticPaths`, and
  file-system routing under `pages/`. App Router support is planned.

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

const componentsModule = packageModule('@demo/components');

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
      factoryImport: relativeModule('lib/handler-factory/none'),
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

The CLI generates handler artifacts or runs analysis only.

```bash
next-slug-splitter                    # Generate handlers and artifacts
next-slug-splitter --analyze-only     # Analyze without generating
next-slug-splitter --analyze-only --json  # JSON output for tooling
```

Without `--config`, the CLI falls back to discovering one of the standard Next
config filenames in the current working directory.

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
2. This proxy intercepts page requests matching configured route base paths
3. On first request for an unknown route, a worker process classifies it as
   heavy or light
4. Heavy routes are rewritten to their generated handler pages; light routes
   pass through to the catch-all page
5. Discoveries are cached in `lazy-discovery.json` for subsequent requests

Benefits over rewrite mode in development:

- **Instant startup** — no upfront generation pass
- **On-demand discovery** — only routes actually visited are classified
- **Automatic caching** — subsequent requests resolve instantly from cache

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

The development routing mode defaults to `'proxy'`. To override:

```js
// In route-handlers-config.mjs
export const routeHandlersConfig = {
  app: {
    routing: {
      development: 'rewrites' // Use rewrite mode even in development
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

### `createCatchAllRouteHandlersPreset(options)`

Create one catch-all target with normalized route and path values.

| Option | Description |
|--------|-------------|
| `routeSegment` | Public route segment (e.g. `'docs'`, `'blog'`) |
| `handlerRouteParam` | Dynamic route parameter configuration |
| `contentPagesDir` | Directory containing content pages |
| `handlerBinding` | Binding with processor module for route planning |
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
- Cache management across generation runs
- Rewrite injection or proxy file generation

### Runtime Reuse

The runtime keeps reuse narrowly scoped to the artifacts it actually owns:

- **Incremental planning** — per-target selective emission when configs match
- **Lazy discovery snapshots** — proxy-mode request-time discoveries persisted to disk

### Proxy File Lifecycle

In proxy mode, the adapter generates a thin `proxy.ts` bridge file at the app
root. This file:

- Imports the library-owned proxy runtime
- Embeds static matchers for configured route base paths and locales
- Is automatically created when entering proxy mode and cleaned up when leaving

The generated file is marked with an ownership marker so it can be distinguished
from user-authored proxy files.

### Worker Process

In proxy mode, route classification happens in a child worker process. This is
necessary because the proxy runtime environment cannot dynamically import
app-owned configuration modules. The worker loads the config, classifies the
route, and returns the result to the proxy runtime.

## Capabilities

- Two operation modes optimized for their respective environments
- Lazy on-demand route discovery in development
- Multi-level caching for fast rebuilds and instant dev restarts
- Install rewrite integration without mutating the incoming Next config object
- Resolve app-level and target-level route handler config in one shared shape
- Discover content pages and generate handler artifacts per target
- Reuse handler bindings for processor-driven route planning
- Support multi-target setups such as `docs` plus `blog`
- Offer both generation and analyze-only CLI modes
- Locale-aware routing with configurable detection modes
- Phase-aware behavior — only active during development, build, and production server phases

## Next.js Integration Points

| Next.js API | Purpose |
|---|---|
| `adapterPath` | Adapter entry point — hooks into Next.js config resolution |
| `rewrites()` → `beforeFiles` | Routes heavy-page traffic to generated handlers in production |
| `proxy.ts` (root file) | Intercepts and classifies requests on demand in development |
| Phase constants | Selects rewrite mode (build/serve) or proxy mode (dev) |
