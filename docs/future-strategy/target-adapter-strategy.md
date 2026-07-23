# Future Target And Adapter Strategy

This document describes how future targets can fit into
`next-slug-splitter` without changing the core promise of the project.

The focus remains Next.js.

The project should not become a generic bundler optimizer before it has a strong
Next.js story for MDX, headless CMS pages, visual page builders, and commerce
templates.

## What The System Solves

The system solves a specific route-shape problem:

```txt
many URLs
  -> one catch-all route
  -> one generic renderer
  -> one large component registry
  -> route chunk can include too many possible components
```

The visible symptom is a route-specific bundle that is too large because the
catch-all route imports every possible component at the top of the file.

Example:

```tsx
import { Hero } from '@/components/hero';
import { ProductGrid } from '@/components/product-grid';
import { VideoBlock } from '@/components/video-block';
import { Reviews } from '@/components/reviews';
import { ThreeDViewer } from '@/components/three-d-viewer';
import { StoreLocator } from '@/components/store-locator';

export default async function Page({ params }) {
  const page = await loadPage(params.slug);

  return <PageRenderer page={page} />;
}
```

The route data decides which components are used, but the module graph already
contains the whole registry.

The splitter approach changes the route graph:

```txt
route facts
  -> selected component keys
  -> generated route handler
  -> static imports for selected components only
  -> Next.js emits a smaller route-specific chunk
```

Generated handler example:

```tsx
import { Hero } from '@/components/hero';
import { ProductGrid } from '@/components/product-grid';

export default createGeneratedPage({
  components: {
    Hero,
    ProductGrid
  }
});
```

The generated file gives Next.js a smaller entry point for that route or route
variant.

## Target Families

Future target work should be organized first by the kind of component-key source
and only second by product or vendor name.

There are two major families:

```txt
MDX-related targets
  -> component keys come from MDX component usage

non-MDX composition targets
  -> component keys come from CMS, visual builder, or commerce template data
```

That separation matters because the adapter input is different. MDX targets use
the existing MDX capture pipeline. Non-MDX targets need a future component-key
provider.

## MDX-Related Targets

Status: current focus.

Key source:

```txt
custom JSX component names in MDX
```

Examples:

- local MDX docs apps
- Fumadocs integrations
- internal MDX help centers

Why it fits:

- component usage is explicit in content
- MDX has an analyzable syntax tree
- the project already captures transitive MDX component usage
- route-specific generated handlers match the existing Next.js adapter

Current and near-term targets:

| Target                    | Next.js shape              | Key source          | Fit                   |
| ------------------------- | -------------------------- | ------------------- | --------------------- |
| Fumadocs                  | App Router docs framework  | MDX component names | current integration   |
| local MDX docs apps       | App Router or Pages Router | MDX component names | current core use case |
| internal MDX help centers | App Router or Pages Router | MDX component names | current core use case |

These targets stay close to the existing product. The route content is MDX, the
component usage is directly visible in the MDX graph, and generated handlers can
preserve normal Next.js routing semantics.

## Non-MDX Composition Targets

Non-MDX targets are future work. They are related to the same catch-all bundle
problem, but they do not use the MDX capture pipeline. They need a provider that
extracts component keys from composition data.

```txt
composition data
  -> component keys
  -> existing routeHandlerProcessor
  -> generated handler
```

### Headless CMS targets

Status: future strategy.

Key sources:

```txt
section.type
block.type
contentType
__typename
_type
component
```

Examples:

- Contentful
- Sanity
- Storyblok
- Builder.io
- custom CMS systems

Why it fits:

- page composition is data
- component identity usually exists as a content model field
- catch-all CMS routes often use global registries
- the route-specific component set can often be known from a page snapshot or
  content release

Potential provider shape:

```txt
CMS page query
  -> page sections and blocks
  -> component keys
  -> generated handler imports selected components
```

Primary risk:

- CMS content can change without deployment. The provider must define whether it
  reads a published snapshot, build-time export, release, or runtime data.

Candidate providers:

| Target             | Next.js shape | Key source                                     | Fit                |
| ------------------ | ------------- | ---------------------------------------------- | ------------------ |
| Contentful         | headless CMS  | content type ID, `__typename`, section fields  | provider candidate |
| Sanity             | headless CMS  | `_type`                                        | provider candidate |
| Storyblok          | headless CMS  | blok `component`                               | provider candidate |
| custom CMS systems | app-defined   | block `type`, section `type`, component `name` | provider candidate |

These are not "docs integrations" in the current sense. They become relevant
when a Next.js catch-all route renders CMS-authored pages through a generic
component registry.

### Visual page-builder targets

Status: high-value future target.

Key sources:

```txt
registered component type
page snapshot component nodes
builder component name
```

Examples:

- Makeswift
- Builder.io
- visual CMS systems embedded in Next.js storefronts

Why it fits:

- these systems usually require a global component registry
- the page snapshot knows which registered component types are present
- the generic catch-all renderer can import too many registered components
- route-specific handlers can register only the subset needed by a page or page
  variant

Example Makeswift-style key:

```ts
runtime.registerComponent(HelloWorld, {
  type: 'catalyst-hello-world',
  label: 'Catalyst/Hello, World!'
});
```

The `type` value is a natural `capturedComponentKeys` source.

Potential provider shape:

```txt
Makeswift page snapshot
  -> component node types
  -> selected registry entries
  -> generated route-specific provider
  -> generated route handler
```

This is especially interesting for BigCommerce Catalyst plus Makeswift because
the storefront is Next.js-based and the page-builder route is catch-all shaped.

Candidate providers:

| Target                        | Next.js shape                     | Key source                                       | Fit                  |
| ----------------------------- | --------------------------------- | ------------------------------------------------ | -------------------- |
| Makeswift                     | App Router catch-all page builder | registered component `type`, page snapshot nodes | strong future target |
| Builder.io                    | visual builder                    | registered component name, page model components | provider candidate   |
| visual CMS systems in Next.js | App Router or Pages Router        | registered component type                        | provider candidate   |

Visual builders are likely the cleanest first non-MDX provider family because
they commonly have explicit component registries and page snapshots.

## Commerce Verticals Built On Composition

Commerce platforms are high-value verticals, but they should not be confused
with the component-key provider itself.

Pure commerce backend data rarely answers the key question:

```txt
Which React components does this route need?
```

The useful layer is usually a CMS, page builder, or template system attached to
the storefront.

### Commerce template targets

Status: future vertical built on CMS or template keys.

Key sources:

```txt
product template
collection template
page template
stable route variant
CMS section types
visual builder component types
```

Examples:

- BigCommerce Catalyst
- commercetools Frontend
- custom Shopify storefronts built on Next.js
- Saleor storefronts with CMS/page-builder composition
- Alokai Next.js storefronts

Why it fits:

- ecommerce pages often have heavy route-specific widgets
- product pages can vary by template
- campaign pages and landing pages can be component-rich
- page-builder and CMS integration is common

Important distinction:

Pure ecommerce backend data is usually not enough. Product title, price,
inventory, checkout, and cart data do not necessarily identify which React
components should be bundled.

The useful layer is composition:

```txt
CMS sections
visual builder nodes
product template variants
commerce page-builder schema
```

The target is not "Shopify" or "BigCommerce" by itself. The target is a
Next.js storefront where route composition data can produce component keys.

Candidate commerce verticals:

| Target                     | Next.js shape                     | Key source                                            | Fit                         |
| -------------------------- | --------------------------------- | ----------------------------------------------------- | --------------------------- |
| BigCommerce Catalyst       | Next.js commerce framework        | templates, Makeswift, CMS blocks                      | strong future vertical      |
| commercetools Frontend     | Next.js storefront platform       | `tasticType`                                          | strong future target        |
| Catalyst + Makeswift       | App Router catch-all page builder | registered component `type`                           | strong first commerce proof |
| custom Shopify storefronts | Next.js when user-built           | CMS sections, visual builder nodes, product templates | possible future vertical    |
| Saleor storefronts         | Next.js storefront                | CMS/page-builder composition when present             | possible future vertical    |
| Alokai Next.js storefronts | Next.js commerce frontend         | CMS/page-builder composition, backend templates       | possible future vertical    |

The best commerce candidate is one where the route composition layer is explicit.
`commercetools Frontend` is compelling because `tasticType` is already a
component identifier. Catalyst plus Makeswift is compelling because the
registered Makeswift component `type` can be extracted from page snapshots.

## Non-Current-Adapter Research

Some large ecosystems have similar component-key concepts, but they do not fit
the current Next.js adapter.

| Target           | Framework shape           | Key source                    | Fit                 |
| ---------------- | ------------------------- | ----------------------------- | ------------------- |
| Shopify Hydrogen | React Router, not Next.js | metaobject type, section type | not current adapter |
| Docusaurus       | non-Next docs framework   | MDX/component graph           | not current adapter |
| Astro/Starlight  | Astro/Vite                | content component usage       | not current adapter |

These targets are useful research material, but supporting them would require
new framework or bundler adapters. They should not drive the current Next.js
provider design.

## Target-Based Strategy

The future strategy should be target-based at the provider layer and shared at
the generator layer.

Shared layers:

```txt
route planning
processor resolution
generated handler emission
Next.js rewrites
Next.js route chunking
```

Target-specific layers:

```txt
MDX capture
CMS page snapshot extraction
visual builder snapshot extraction
commerce template resolution
target cache invalidation
target route enumeration
```

That division keeps target work small:

```txt
new target provider
  -> find route paths
  -> find component keys
  -> report cache dependencies
  -> reuse existing processor and generator
```

## Current Adapter Versus Future Providers

The current Next.js adapter owns:

- Next.js config integration
- App Router and Pages Router handling
- route discovery from configured content targets
- generated handler paths
- rewrite installation
- development proxy behavior
- build-time emission

Future providers should not own those concerns. They should provide facts to
the adapter:

```ts
type RouteComponentKeyResult = {
  routePath: string;
  componentKeys: string[];
  sourceFiles?: string[];
  remoteSnapshotId?: string;
  targetMetadata?: Record<string, unknown>;
};
```

Then the existing processor can decide:

- which captured keys are loadable
- which imports to emit
- which runtime factory to use
- whether a route is heavy or light

## Why Not Runtime Dynamic Imports First

A runtime dynamic import approach would look like this:

```ts
const registry = {
  Hero: () => import('@/components/hero'),
  ProductGrid: () => import('@/components/product-grid')
};
```

That can reduce initial module binding in some cases, but it changes the
application runtime model:

- components load during rendering
- waterfalls can appear
- error and loading states become app concerns
- the optimization leaks into application code
- server and client behavior can diverge

The splitter strategy is different:

```txt
generate route-specific static imports before Next builds
```

This lets Next.js keep normal route chunking semantics.

## Why Not Generic TS/JS Analysis First

Generic TypeScript or JavaScript analysis is too broad for the next phase.

Example difficult input:

```ts
const registry = getRegistryForMarket(locale);
const blocks = await loadBlocks(params.slug);

return blocks.map(block => {
  const Component = registry[block.type];

  return <Component key={block.id} {...block.props} />;
});
```

An analyzer would need to understand:

- where `registry` comes from
- what values `block.type` can contain
- what remote data looks like
- which branches can execute for each route
- whether feature flags or personalization change the component set

That is an application semantics problem, not just an AST problem.

For now, the future strategy should skip arbitrary TS/JS analysis and prefer
explicit target providers. Later, TS/JS work can appear as diagnostics or as
framework-specific extractors where the semantics are stable.

Possible later diagnostics:

- detect large top-level registries in catch-all routes
- detect imports from known heavy component modules
- warn when a catch-all renderer imports every CMS component
- suggest moving component identity into a provider manifest

Diagnostics can help users see the problem without pretending to solve arbitrary
application semantics.

## Next.js Focus

The project should remain Next.js-focused while this strategy matures.

Reasons:

- generated route handlers are Next.js route files
- rewrites are Next.js rewrites
- measurement relies on Next.js build output and chunk paths
- App Router and Pages Router have different but known integration points
- the current demos and Live Benchmark are built around Next.js zones

Non-Next frameworks may be interesting later, but they need separate adapters.
For example:

- Hydrogen would need a React Router or Vite adapter
- Docusaurus would need a Docusaurus/Webpack adapter
- Astro would need an Astro/Vite adapter

Those are not small extensions of the current Next.js adapter.

## Recommended Future Order

1. Stabilize the current MDX Next.js story.
2. Keep Fumadocs as first-class framework integration.
3. Define a provider interface for non-MDX component keys.
4. Prototype a visual builder provider where component keys are explicit.
5. Use BigCommerce Catalyst plus Makeswift as the first commerce-shaped target.
6. Research commercetools Frontend because `tasticType` is an excellent key
   source.
7. Add diagnostics for catch-all top-level registries.
8. Defer arbitrary TypeScript and JavaScript analysis until there are stable
   provider patterns.

## Success Criteria

A future target is a good fit when it can answer these questions:

1. Can the app enumerate routes or route variants?
2. Can the app identify the component keys for each route or variant?
3. Are those component keys stable enough at build time?
4. Can those keys map to static component imports?
5. Can a generated Next.js route handler preserve the target framework's normal
   rendering behavior?
6. Can the Live Benchmark measure a route-specific chunk improvement?

If the answer is yes, the target can probably reuse the existing splitter model.

If the answer is no, the target may still be useful as a diagnostic or research
case, but it should not drive the core adapter design.
