# App Locale Policy Refactor

Follow-up idea for centralizing the App Router locale layer after multi-locale
App support has landed.

## Status

Planned cleanup. This is not required for the current feature to work.

The current implementation is intentionally split by runtime responsibility:

- build mode emits Next rewrite objects
- dev mode emits proxy decisions
- generated App handlers need concrete route params
- App static-param filtering reads `params.locale`
- lazy proxy request resolution maps one public pathname to locale + slug

That split is healthy. The refactor proposed here should not merge those
mechanical layers into one large module. The goal is narrower: centralize the
pure App-locale policy rules so build, proxy, generator, and lookup code do not
drift from each other.

In short: avoid drift where one shared policy helper can express the rule, and
reduce drift where different layers still need their own output shapes and
comments.

## Problem

The App Router has no Pages-style built-in i18n routing layer. The library
supports an app-owned locale layer built on a physical `[locale]` segment:

```txt
app/[locale]/docs/[...slug]/page.tsx
```

That means several parts of the library need to understand the same rules:

1. Multi-locale App targets use a physical `[locale]` segment.
2. Single-locale App targets do not use a `[locale]` segment.
3. Default-locale unprefixed URLs can normalize to the physical default-locale
   path.
4. Root targets do not get broad default-locale normalization.
5. Already locale-prefixed URLs must not be normalized again.
6. Generated handlers receive locale through params, not through a locale
   prefix in the internal destination path.

Today these rules are implemented through several focused modules. That is
mostly fine, but some policy knowledge is repeated across build and dev paths.
When a rule is repeated, its comments and tests can also drift.

Examples of possible drift:

- build says root targets cannot normalize, but proxy forgets that guard
- proxy says already-prefixed paths skip normalization, but rewrite docs do not
  mention it
- comments describe locale normalization as build-only even though dev mirrors it
- tests cover the rule in one path but not the other

The refactor should make those shared decisions explicit and reusable.

## Proposed Structure

Prefer a small App-locale folder over a broad single file:

```txt
src/next/app/locale/
  policy.ts
  route-params.ts
```

This keeps the code scoped to the App Router and avoids making the locale layer
look like a generic library-wide locale implementation.

## `route-params.ts`

Owns the physical App route-param convention.

Current candidates to move from `src/next/app/route-params.ts`:

```ts
APP_LOCALE_ROUTE_PARAM_NAME
resolveOptionalAppLocaleRouteParamName
```

Purpose:

1. Define that the app-owned physical route segment is named `locale`.
2. Return the locale param name only for multi-locale App configs.
3. Let generator and static-param filtering share the same route-param constant.

This file should not know about rewrites, proxy decisions, or generated-handler
paths. It only owns the `[locale]` param convention.

## `policy.ts`

Owns pure App-locale policy decisions.

Candidate helpers:

```ts
usesAppLocaleRouteSegment(localeConfig)
canNormalizeAppDefaultLocaleRouteBase(routeBasePath)
isAppDefaultLocaleNormalizationCandidate(...)
buildPhysicalAppDefaultLocaleRoutePath(...)
```

The exact names can be refined during implementation. The important boundary is
that these helpers should return booleans, normalized path strings, or small
plain data shapes. They should not return framework-specific outputs.

Good outputs:

```ts
boolean
string
{ shouldNormalize: boolean; reason?: string }
```

Avoid outputs like:

```ts
RouteHandlerRewrite
RouteHandlerProxyDecision
```

Those belong to the mechanical layer that consumes the policy.

## What Stays Outside

| Area | Stays In | Why |
| --- | --- | --- |
| Next rewrite objects | `src/next/app/rewrites/default-locale-normalization.ts` | Build mode owns Next config shape |
| Proxy decisions | `src/next/app/proxy/default-locale-normalization.ts` | Dev mode owns request-time response shape |
| Static-param filtering loop | `src/next/app/filter-static-params.ts` | Lookup helper owns `generateStaticParams` filtering |
| Generated handler params object | `src/generator/app/protocol/rendered-page.ts` | Generator owns emitted code data |
| Lazy request path ownership | `src/next/proxy/lazy/request-resolution.ts` | Dev worker owns public-path to target identity mapping |

These modules should call the App-locale policy helpers, but they should keep
their output-specific construction.

## Drift Reduction

The largest benefit is reducing implementation, comment, and test drift.

Some drift is unavoidable because build, proxy, generator, and lookup code
produce different artifacts. The target is to keep that drift mechanical, not
semantic.

Implementation drift:

- one helper decides whether App normalization is allowed
- one helper decides whether the target route base is safe
- one helper builds the physical default-locale App path
- build and proxy consume the same answers

Comment drift:

- policy comments live near the policy code
- build and proxy comments can describe only their mechanical output
- architecture docs can reference one policy module instead of restating rules
  differently per path

Test drift:

- unit tests for `policy.ts` cover the shared matrix once
- build tests verify rewrite-object placement and phase behavior
- proxy tests verify proxy-decision materialization and sequencing
- fewer duplicated policy cases are needed in integration-style tests

The goal is not to remove all build/proxy tests. The goal is to avoid testing
the same policy rule through every layer when one direct policy test plus one
or two integration checks is enough.

## Expected Call Shape

Build mode:

```ts
const normalizationPolicy = resolveAppDefaultLocaleNormalizationPolicy(...);

if (normalizationPolicy.shouldNormalize) {
  return createNextRewrite(normalizationPolicy.source, normalizationPolicy.path);
}
```

Dev proxy mode:

```ts
const normalizationPolicy = resolveAppDefaultLocaleNormalizationPolicy(...);

if (normalizationPolicy.shouldNormalize) {
  return createProxyRewriteDecision(normalizationPolicy.path);
}
```

Both paths share the decision, but each path keeps its own output format.

## Migration Plan

1. Create `src/next/app/locale/route-params.ts`.
2. Move the App locale route-param constant and resolver into it.
3. Update imports from `src/next/app/route-params.ts`.
4. Create `src/next/app/locale/policy.ts`.
5. Move or wrap `buildPhysicalAppDefaultLocaleRoutePath(...)` there if it stays
   output-independent.
6. Add shared predicates for:
   - multi-locale App config
   - non-root route base
   - default-locale request
   - already locale-prefixed pathname
7. Refactor build normalization to consume policy helpers.
8. Refactor proxy normalization to consume the same policy helpers.
9. Keep route-handler guard and heavy-route rewrite logic unchanged.
10. Run focused tests, then the full suite.

## Test Plan

Direct policy tests:

| Case | Expected |
| --- | --- |
| single-locale config | no locale route segment, no normalization |
| multi-locale non-root default request | normalization allowed |
| multi-locale root target | normalization blocked |
| non-default request | normalization blocked |
| already locale-prefixed path | normalization blocked |
| default unprefixed path | physical path uses `defaultLocale` |

Build tests:

- App normalization still emits `afterFiles` rewrites
- Pages emits no App normalization rewrites
- root App targets emit no normalization rewrites
- heavy rewrites and generated-handler guards stay in `beforeFiles`

Proxy tests:

- policy decision is invoked for target-owned App light and missing routes
- proxy materializes allowed normalization as a rewrite
- proxy passes through blocked cases
- generated-handler public guard ordering remains unchanged

Generator/static-param tests:

- multi-locale generated handlers still receive `{ locale, slug }`
- single-locale generated handlers still omit `locale`
- static-param filtering still reads `params.locale`

## Non-Goals

- Do not introduce Next-native App i18n. The layer remains app-owned.
- Do not move Pages Router i18n behavior into App locale modules.
- Do not make one large locale service object.
- Do not change public routing behavior.
- Do not change rewrite phase ordering.

## Open Questions

1. Should `buildPhysicalAppDefaultLocaleRoutePath(...)` move into `policy.ts`,
   or stay in the rewrite module and be wrapped by a policy helper?
2. Should policy helpers return only booleans and paths, or include diagnostic
   reasons for tests/debug logging?
3. Should `src/next/app/route-params.ts` remain as a compatibility re-export
   during the move?
4. Should the policy test matrix become the canonical source for build/proxy
   expected behavior tables?

## Recommendation

Do this as a follow-up cleanup after the App multi-locale feature is stable.

The current implementation is functional and reasonably organized. The value of
this refactor is long-term maintainability: one App-locale policy surface, less
duplicated reasoning, and lower risk that build mode, dev proxy mode, comments,
and tests slowly disagree about the same locale-layer rules.
