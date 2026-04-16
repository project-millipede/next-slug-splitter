# Content Compilation

This note describes how content compilation currently works in the Page Router
and App Router integrations.

The goal is to make three boundaries explicit:

1. route semantics
2. generated-handler planning
3. MDX or page-data compilation

## Current Rule

The route contract remains the semantic owner of the route.

That means the route layer still decides:

- which params exist
- which metadata is returned
- when content compilation should happen
- how compiler output is interpreted into final page props

Compilation itself may run somewhere else, but that execution boundary does not
transfer route ownership away from the route contract.

## High-Level Comparison

| Aspect                              | Page Router                                                              | App Router                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Public authored route seam          | `pages/docs/[...slug].tsx`                                               | `app/docs/[...slug]/route-contract.ts` plus `app/docs/[...slug]/page.tsx`              |
| Primary page-data seam              | `getStaticProps`                                                         | `loadPageProps(params)`                                                                |
| Static param seam                   | `getStaticPaths`                                                         | `generateStaticParams` via `getStaticParams()`                                         |
| Who executes normal page semantics  | Next page lifecycle                                                      | Next page lifecycle through the route contract                                         |
| Who owns heavy/light planning       | Library analysis and emission pipeline                                   | Library analysis and emission pipeline                                                 |
| Who owns route semantics            | Public page module                                                       | Route-owned contract                                                                   |
| Where heavy-route filtering happens | Page-time wrapper around `getStaticPaths`                                | Page-time wrapper around `generateStaticParams`                                        |
| How compiler module is discovered   | App code usually imports compiler logic directly from the page-data path | Persisted lookup snapshot stores the compiler module path                              |
| How compiler module executes        | Inside the normal Page Router page-data path                             | In an isolated library-owned worker                                                    |
| Why compilation strategy differs    | No App server-graph boundary problem                                     | App route contract sits inside the App server graph, so compiler execution is isolated |

## Page Router Model

The Page Router path relies on Next's native page-data lifecycle.

The important properties are:

1. `getStaticPaths` and `getStaticProps` belong to the public page.
2. Generated heavy handlers delegate back into that page-data seam.
3. The library worker does not become the semantic owner of page data.
4. Compilation can run inside the page-data path because the public page module
   is already the runtime boundary that Next executes.

In practical terms, the Page Router path does not need a separate page-data
compiler worker contract.

## App Router Model

The App Router path needs one extra boundary because the authored route
contract sits inside the App server graph.

The important properties are:

1. `route-contract.ts` is the authored semantic source of truth.
2. The public light page and generated heavy pages both call that contract
   directly.
3. Workers still do not own route semantics.
4. Compiler execution is isolated from the App server process.

That isolation is needed because the compiler module may import packages such
as `esbuild` and other build-only tooling that should not be traced as part of
the App server graph.

## App Router Compilation Flow

The current App Router compilation path is:

1. config resolution validates `handlerBinding.pageDataCompilerImport`
2. adapter or proxy bootstrap resolves that module reference to a runtime path
3. the resolved path is persisted into the route-handler lookup snapshot
4. page-time route code calls `runAppPageDataCompiler({ targetId, input })`
5. the helper reads the persisted snapshot
6. the helper sends the request to the library-owned page-data worker
7. the worker imports the compiler module and calls
   `pageDataCompiler.compile({ targetId, input })`
8. the route contract interprets the returned serializable result as page props

This keeps page-time code small:

- no config reload
- no module-reference resolution at page time
- no app-local worker setup

This also keeps proxy and build execution isolated:

- compiler code runs outside the Next server process
- worker lifecycle and shutdown stay library-owned

## Why `pageDataCompilerImport` Lives Beside `processorImport`

The current App compiler contract intentionally mirrors the processor model
without reusing the processor contract itself.

The shared ideas are:

1. config points at an app-owned module
2. the library resolves that module
3. the library executes that module in a controlled runtime boundary

The responsibilities remain separate:

| Concern          | `processorImport`                                       | `pageDataCompilerImport`             |
| ---------------- | ------------------------------------------------------- | ------------------------------------ |
| Main purpose     | Handler planning and emitted component/factory bindings | Page-data compilation or preparation |
| Typical input    | Captured component keys and planning context            | Route-contract input payload         |
| Typical output   | Generated-handler planning data                         | Serializable page-data result        |
| Execution timing | Planning and generation                                 | Page-time route data loading         |

Keeping the contracts separate avoids mixing build planning with page-data
semantics.

## JavaScript And TypeScript Variants

The demo intentionally shows two runtime models:

| Variant            | Processor module | Page-data compiler module | Runtime import target         |
| ------------------ | ---------------- | ------------------------- | ----------------------------- |
| JavaScript variant | authored `.mjs`  | authored `.mjs`           | source module loaded directly |
| TypeScript variant | authored `.ts`   | authored `.ts`            | prepared `dist/*.js` artifact |

The TypeScript variant follows the same rule for both modules:

1. `prepare` transpiles TypeScript first
2. runtime code imports JavaScript artifacts from `dist/`

The worker does not transpile TypeScript on the fly.

## Snapshot Ownership

The persisted lookup snapshot is the page-time discovery mechanism for the App
compiler module.

The snapshot stores only the metadata that page-time code actually needs:

- target id
- heavy-route path keys
- App slug param metadata
- optional App locale param metadata
- resolved page-data compiler module path

It does not store:

- full config objects
- processor implementations
- route-contract code
- compiler results

That narrow scope keeps the snapshot useful without turning it into a second
config system.

## Boundaries That No Longer Exist

The current preferred App model intentionally avoids these older patterns:

1. a second authored worker-only route runtime contract
2. worker-owned App route semantics
3. page-time config reloads to find the compiler module
4. app-local worker service and runner files

## Practical Reading Guide

For the current App Router compilation path, read these files in order:

1. `demo/app-router/app/docs/[...slug]/route-contract.ts`
2. `demo/app-router/config-variants/javascript/route-handlers-config.mjs`
3. `demo/app-router/config-variants/typescript/route-handlers-config.ts`
4. `src/next/shared/config/handler-binding.ts`
5. `src/next/shared/adapter.ts`
6. `src/next/shared/lookup-persisted.ts`
7. `src/next/shared/heavy-route-lookup.ts`
8. `src/next/app/page-data-compiler-run.ts`
9. `src/next/app/page-data-worker/host/client.ts`
10. `src/next/app/page-data-worker/runtime/entry.ts`

That sequence shows:

1. authored route semantics
2. authored compiler module selection
3. config resolution
4. snapshot persistence
5. page-time lookup
6. isolated compiler execution
