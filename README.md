# next-slug-splitter

> Build-time Next.js route handler generation and rewrite integration for large content trees

A configuration-driven package for analyzing content page trees, generating
route-specific handlers, and wiring the resulting rewrites into a Next.js app.

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Quick Start](#quick-start)
4. [Usage](#usage)
5. [Reference](#reference)
6. [Capabilities](#capabilities)

## Overview

### Features

- **Next.js Integration:** `withSlugSplitter(...)` installs the adapter entry
  and connects one app-owned route handlers config file.
- **Config-Driven Targets:** Declare one or more route spaces such as `docs`
  and `blog` with app-level and target-level settings.
- **Build-Time Analysis:** Discover content pages, resolve component metadata,
  and classify heavy routes before the app build.
- **Generated Route Handlers:** Emit dedicated handler pages and supporting
  artifacts for the configured route targets.
- **Rewrite Injection:** Prepend generated rewrites ahead of existing
  `beforeFiles` rewrites during the relevant Next.js phases.
- **Locale-Aware Routing:** Support locale detection based on filenames or a
  default-locale routing model.

### Why Use It?

Content-heavy route spaces such as docs and blogs often benefit from an extra
build-time pass that can:

1. Inspect the available content pages
2. Generate dedicated route handlers for selected routes
3. Install rewrites that route matching traffic into those generated handlers

`next-slug-splitter` keeps that work explicit and app-owned:

- Next config integration lives in `withSlugSplitter(...)`
- target declarations live in `route-handlers-config.mjs`
- generation can run as a separate CLI step before `next build`

## Getting Started

### Installation

```bash
npm install next-slug-splitter next
# or
pnpm add next-slug-splitter next
```

This package is intended for Next.js applications that own one or more large
content route spaces and want build-time handler generation plus rewrite
installation.

## Quick Start

If the goal is the shortest path to adoption:

1. Wrap the Next config with `withSlugSplitter(...)`
2. Add `route-handlers-config.mjs`
3. Run the CLI before `next build`

### Minimal Next Config

```js
/** @type {import('next').NextConfig} */
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

### Minimal Route Handlers Config

```js
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
    nextConfigPath
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

### Minimal Build Step

```json
{
  "scripts": {
    "route:handlers:generate": "next-slug-splitter",
    "build": "pnpm route:handlers:generate && next build"
  }
}
```

## Usage

This package has three main pieces.

### 1. Wrap the Next Config

`withSlugSplitter(nextConfig, { configPath })` resolves the app-owned route
handlers config and installs the published adapter entry into
`experimental.adapterPath`.

Use this when the app should automatically apply generated rewrites during the
relevant Next.js phases.

### 2. Declare Route Targets

`route-handlers-config.mjs` is the app-owned source of truth for route handler
generation.

A target typically describes:

- the public route segment such as `docs` or `blog`
- the dynamic route parameter kind
- the content page directory
- the binding that provides component imports and runtime factory imports

`createCatchAllRouteHandlersPreset(...)` is the shortest way to configure
catch-all targets without hand-assembling all path values.

### 3. Generate or Analyze

The CLI can either generate outputs or run analysis only.

```bash
next-slug-splitter
next-slug-splitter --analyze-only
next-slug-splitter --analyze-only --json
```

Without `--config`, the CLI falls back to discovering one of the standard Next
config filenames in the current working directory.

## Reference

### `withSlugSplitter(nextConfigExport, options)`

Wrap one Next config export and register the route handlers config file.

Important option:

- `configPath`: path to the app-owned `route-handlers-config` module

### `createCatchAllRouteHandlersPreset(options)`

Create one catch-all target with normalized route and path values.

Common options:

- `routeSegment`
- `handlerRouteParam`
- `contentPagesDir`
- `handlerBinding`
- `contentLocaleMode`

### `DynamicRouteParam`

Supported `kind` values:

- `single`
- `catch-all`
- `optional-catch-all`

### `contentLocaleMode`

Supported modes:

- `filename`
- `default-locale`

Use `filename` when locale is encoded in the content file naming scheme.
Use `default-locale` when the default locale omits the locale prefix in the
public route space.

## Capabilities

- Install rewrite integration without mutating the incoming Next config object
- Resolve app-level and target-level route handler config in one shared shape
- Discover content pages and generate handler artifacts per target
- Reuse handler bindings for component imports and runtime factory selection
- Support multi-target setups such as `docs` plus `blog`
- Offer both generation and analyze-only CLI modes
