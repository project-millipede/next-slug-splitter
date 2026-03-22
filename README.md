# next-slug-splitter

> Next.js route handler generation with build-time rewrites and dev-time request routing

A configuration-driven package for analyzing content page trees, generating
route-specific handlers, and routing traffic into those handlers — either
through build-time rewrites (production) or a request-time proxy (development).

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Quick Start](#quick-start)
4. [Operation Modes](#operation-modes)
5. [Usage](#usage)
6. [Configuration Reference](#configuration-reference)
7. [Architecture](#architecture)
8. [Capabilities](#capabilities)

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

- **In production:** The CLI generates dedicated handler pages for heavy routes
  and installs rewrites that route matching traffic into those handlers.
- **In development:** A proxy discovers heavy routes lazily on first request,
  avoiding regeneration on every content change and enabling instant dev startup.

The configuration lives in one app-owned file, the integration is a single
`withSlugSplitter(...)` wrapper, and the routing strategy adapts automatically
to the current Next.js phase.

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
import { createCatchAllRouteHandlersPreset } from 'next-slug-splitter/next/config';
import { routeHandlerBindings } from 'site-route-handlers/config';

const rootDir = process.cwd();
const nextConfigPath = path.resolve(rootDir, 'next.config.mjs');

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
    nextConfigPath,
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

### 3. Generate Before Build (Production Only)

```json
{
  "scripts": {
    "route:handlers:generate": "next-slug-splitter",
    "build": "pnpm route:handlers:generate && next build"
  }
}
```

> **Note:** In development, proxy mode is the default. No generation step is
> needed — routes are discovered on demand when first requested.

## Operation Modes

### Rewrite Mode (Production Default)

Used during `PHASE_PRODUCTION_BUILD` and `PHASE_PRODUCTION_SERVER`.

1. The CLI analyzes content pages and generates dedicated handler page files
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

The lazy proxy system is self-healing: when handler files are missing (e.g.
after a clean script or fresh checkout), the first request to a heavy route
triggers on-demand re-emission within the same request cycle. The discovery
snapshot validates that the handler file exists on disk before returning a
cached rewrite destination. If the file is missing, the request falls through
to the full lazy-miss path which re-analyzes the content, re-emits the handler,
and returns the rewrite — all before the proxy response is sent.

**No custom 404 page is required** for handler generation to work correctly.

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

## Usage

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
- the binding that provides component imports and runtime factory imports

`createCatchAllRouteHandlersPreset(...)` is the shortest way to configure
catch-all targets without hand-assembling all path values.

### 3. Generate or Analyze (Production)

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
| `app.nextConfigPath` | Path to the Next config file |
| `app.routing.development` | Development routing mode: `'proxy'` (default) or `'rewrites'` |
| `app.prepare` | Optional preparation steps run before route planning |
| `targets` | Array of target configurations |

### `createCatchAllRouteHandlersPreset(options)`

Create one catch-all target with normalized route and path values.

| Option | Description |
|--------|-------------|
| `routeSegment` | Public route segment (e.g. `'docs'`, `'blog'`) |
| `handlerRouteParam` | Dynamic route parameter configuration |
| `contentPagesDir` | Directory containing content pages |
| `handlerBinding` | Component imports and runtime factory references |
| `contentLocaleMode` | Locale detection mode (see below) |

### `DynamicRouteParam`

Supported `kind` values:

- `single` — matches a single path segment
- `catch-all` — matches one or more path segments
- `optional-catch-all` — matches zero or more path segments

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

### Cache System

Multiple cache groups work together to avoid redundant work:

- **Preparation cache** — runs app-owned setup steps (e.g. TypeScript compilation)
- **Process-local cache** — deduplicates generation within one Node process
- **Persistent shared cache** — on-disk cache keyed by pipeline fingerprint
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
- Reuse handler bindings for component imports and runtime factory selection
- Support multi-target setups such as `docs` plus `blog`
- Offer both generation and analyze-only CLI modes
- Locale-aware routing with configurable detection modes
- Phase-aware behavior — only active during development, build, and production server phases
