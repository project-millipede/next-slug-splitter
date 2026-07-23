# Future Strategy: Component Key Sources

`next-slug-splitter` currently answers one narrow question very well:

> For this Next.js route, which route-specific components are actually needed?

Today the answer comes from MDX. The next strategic question is broader:

> Where can `capturedComponentKeys` come from when the page is not MDX?

This document captures the current model, the future adapter shape, and the
analysis paths we intentionally skip for now.

## Current Scope

The project stays focused on Next.js for now.

Supported routing surfaces:

- Next.js App Router
- Next.js Pages Router
- Next.js rewrites and generated handler pages
- Next.js build manifests and route-specific client chunks

Current content scope:

- MDX content files
- MDX component capture
- route-specific generated handlers
- static imports emitted by those generated handlers

Out of scope for the current implementation:

- Docusaurus, Hydrogen, or other non-Next framework adapters
- generic Vite, React Router, or Webpack adapters
- arbitrary TypeScript or JavaScript route analysis
- runtime-only dynamic import strategies as the primary optimization mechanism

The future direction can expand the source of component keys, but the first
principle remains the same: use Next.js route generation and Next.js chunking to
produce smaller route-specific JavaScript.

## The Problem

Catch-all routes are convenient because one route file can render a large family
of pages:

```txt
app/[...slug]/page.tsx
pages/[...slug].tsx
app/docs/[[...slug]]/page.tsx
app/[locale]/(default)/[...rest]/page.tsx
```

The problem starts when that catch-all route also imports every component that
any page might use:

```tsx
import { Hero } from '@/components/hero';
import { ProductCarousel } from '@/components/product-carousel';
import { VideoSection } from '@/components/video-section';
import { Reviews } from '@/components/reviews';
import { StoreLocator } from '@/components/store-locator';
import { ThreeDViewer } from '@/components/three-d-viewer';

export default async function Page({ params }) {
  const page = await getPage(params.slug);

  return <GenericRenderer page={page} />;
}
```

Even when a specific route only needs `Hero` and `ProductCarousel`, the top-level
route module may bind the full component universe. The bundler must consider
those imports reachable from the catch-all route.

This creates the core bundle problem:

```txt
one catch-all route
+ one generic renderer
+ one global component registry
= too many possible components bound to every page in that route family
```

`next-slug-splitter` solves this by generating a route-specific handler that
imports only the selected components:

```tsx
import { Hero } from '@/components/hero';
import { ProductCarousel } from '@/components/product-carousel';

export default createGeneratedRoute({
  components: {
    Hero,
    ProductCarousel
  }
});
```

The important part is not runtime lazy loading. The important part is that the
generated handler gives Next.js a smaller static import graph for that route.

## Current MDX Flow

Today, component keys come from MDX analysis:

```txt
MDX route file
  -> transitive MDX module graph
  -> custom JSX component names
  -> capturedComponentKeys
  -> routeHandlerProcessor
  -> generated handler with static imports
  -> Next.js route-specific chunk
```

Example:

```mdx
# Dashboard

<FlowComposer />

<ComponentWorkbench />
```

The capture result is:

```ts
capturedComponentKeys = ['FlowComposer', 'ComponentWorkbench'];
```

The route handler processor maps those keys to concrete imports:

```ts
defineRouteHandlerProcessor({
  resolve({ capturedComponentKeys }) {
    return {
      factoryImport,
      components: capturedComponentKeys.map(key => ({
        key,
        componentImport: {
          source: packageModule('@next-slug-splitter/ballast-kit'),
          kind: 'named',
          importedName: key
        }
      }))
    };
  }
});
```

The generated handler then emits static imports:

```tsx
import {
  FlowComposer,
  ComponentWorkbench
} from '@next-slug-splitter/ballast-kit';
```

This gives the route its own smaller dependency graph without requiring the user
to rewrite content pages as hand-authored dynamic imports.

## Future Component Key Providers

The future adapter direction is to keep the downstream pipeline and replace only
the source of the component keys.

Current provider:

```txt
MDX provider
  -> captures JSX component names from MDX
```

Future providers:

```txt
CMS provider
  -> captures section or block types from page data

visual builder provider
  -> captures registered component types from page snapshots

commerce template provider
  -> captures stable product or page template component sets
```

The internal target should stay familiar:

```txt
component key provider
  -> capturedComponentKeys-like values
  -> routeHandlerProcessor
  -> generated handler
  -> static imports
  -> Next.js chunking
```

This keeps the generator strategy stable while allowing new sources of route
facts.

## Common Future Key Sources

Headless CMS and page-builder systems already store component identifiers. They
just do not call them `capturedComponentKeys`.

Likely key sources:

| Source                 | Example key field                | Meaning                                      |
| ---------------------- | -------------------------------- | -------------------------------------------- |
| MDX                    | JSX component name               | `<FlowComposer />`, `<ComponentWorkbench />` |
| Makeswift              | registered component `type`      | `catalyst-hello-world`                       |
| commercetools Frontend | `tasticType`                     | `vendor/product-carousel`                    |
| Storyblok              | blok `component`                 | `hero`, `featuredProducts`                   |
| Sanity                 | document or block `_type`        | `heroSection`, `productGrid`                 |
| Contentful             | content type ID or `__typename`  | `HeroSection`, `ProductCarousel`             |
| Builder.io             | registered component name        | `Hero`, `ProductGrid`                        |
| Shopify themes         | section `type`, block `type`     | `product-recommendations`                    |
| custom CMS             | block `type` or component `name` | app-defined                                  |

These keys can become splitter inputs when they are available at prepare time,
build time, or through a stable route manifest.

## Provider Shape

A future provider should not need to understand how generated handlers are
written. It should only answer route questions:

```ts
type ComponentKeyProvider = {
  resolveRouteKeys(input: {
    routePath: string;
    params: Record<string, string | string[]>;
  }): Promise<{
    keySource: 'mdx' | 'cms' | 'visual-builder' | 'commerce-template';
    componentKeys: string[];
    cacheDependencies?: string[];
  }>;
};
```

The route handler processor remains responsible for mapping component keys to
imports:

```ts
defineRouteHandlerProcessor({
  resolve({ capturedComponentKeys }) {
    return {
      factoryImport,
      components: capturedComponentKeys.map(key => ({
        key,
        componentImport: registry[key]
      }))
    };
  }
});
```

The provider finds keys. The processor decides which keys are loadable and where
they come from.

## Build-Time Versus Runtime Content

Future providers must be explicit about when route composition is known.

Good fit:

- static CMS exports
- page-builder snapshots available at build time
- known product templates
- known route variants
- page manifests fetched during prepare
- stable content release snapshots

Risky fit:

- per-request unpublished CMS state
- product-specific composition that changes without deployment
- personalization-driven component sets
- A/B tests that choose completely different component trees at request time

For ecommerce, the safer unit is usually not one handler per product. It is one
handler per stable route variant:

```txt
product-basic
product-with-reviews
product-with-3d-viewer
product-bundle-builder
cms-landing-page
cms-editorial-page
```

Each product or page resolves to one of those stable variants. The generated
handler imports the components for that variant.

## TypeScript And JavaScript Analysis

Arbitrary TypeScript and JavaScript analysis is intentionally skipped for now.

The tempting idea is:

```txt
read the catch-all route source
  -> statically analyze every import and branch
  -> infer which component is used for which route
```

That is not the right next step.

Reasons:

- application code can branch on arbitrary runtime data
- component selection can hide behind helper functions
- imports can be aliased, re-exported, or dynamically composed
- route data can come from network calls, databases, or feature flags
- a general analyzer risks false confidence

Instead, the future direction should prefer explicit component-key providers.
Those providers can use CMS, page-builder, commerce, or app-specific manifests
where component identity is already data.

This does not rule out TypeScript or JavaScript support forever. It means the
first non-MDX strategy should be declarative and provider-driven:

```txt
do not infer arbitrary app code
do read explicit route composition data
```

Possible later TS/JS support:

- explicit route variant manifests
- generated manifests from application codegen
- user-authored `defineSplitRoute(...)` helpers
- framework-specific extractors where semantics are stable
- lint or diagnostic tools that find top-level catch-all registry imports

The production optimizer should wait until the input facts are reliable.

## Adapter Boundary

The current adapter is a Next.js adapter. Future provider work should not change
that boundary yet.

The near-term architecture is:

```txt
Next.js adapter
  -> route discovery
  -> route rewrites
  -> generated handler emission
  -> provider-specific component keys
```

Not:

```txt
universal bundler adapter
  -> every router
  -> every framework
  -> arbitrary code analysis
```

That focus matters. The optimization works because the library can create
Next.js route files, install Next.js rewrites, and let Next.js produce
route-specific chunks.

## Strategic Summary

The current project is an MDX-first Next.js optimizer.

The future strategy is a component-key provider model:

```txt
MDX today:
  JSX component names

Headless CMS tomorrow:
  section type, block type, component type, content type

Visual builders tomorrow:
  registered component type, snapshot component IDs

Commerce tomorrow:
  product/page template, stable route variant, CMS section composition
```

The core promise stays unchanged:

```txt
Replace one catch-all import universe with route-specific generated handlers.
```
