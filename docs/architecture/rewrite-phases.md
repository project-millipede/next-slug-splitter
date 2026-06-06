# Rewrite Phases

How `next-slug-splitter` installs build rewrites, where `beforeFiles` and
`afterFiles` are used, and which rule wins when multiple layers could apply.

This topic is about **build / adapter rewrite installation**. Development proxy
mode has a separate request-time implementation, but it mirrors the same
priority model: guard first, exact heavy route next, broad App normalization
last.

## Next rewrite phases

Next evaluates rewrite phases around filesystem routing:

```
headers -> redirects -> proxy/middleware -> beforeFiles -> filesystem routes -> afterFiles -> dynamic -> fallback
```

The library uses only two phases today:

| phase | library use |
| --- | --- |
| `beforeFiles` | generated-handler public guards, then exact heavy-route rewrites |
| `afterFiles` | App Router default-locale normalization |

No library `fallback` rewrites are emitted today.

## Library merge order

The wrapper lives in `src/next/shared/rewrites/plugin.ts`.

When the user also defines `nextConfig.rewrites()`, the library merges phases in
this order:

| phase | merge order | priority result |
| --- | --- | --- |
| `beforeFiles` | library first, then user | library guards and exact heavy rewrites win early |
| `afterFiles` | user first, then library | user afterFiles rewrites can run before App normalization |
| `fallback` | user first, then library | unchanged today because the library emits no fallback rewrites |

Deduplication keeps the first occurrence of an identical rewrite. That means:

1. In `beforeFiles`, an identical library rewrite wins over a user rewrite.
2. In `afterFiles`, an identical user rewrite wins over a library rewrite.

## Adapter buckets

The adapter builds library rewrite buckets in `src/next/integration/adapter.ts`.

| router | library `beforeFiles` | library `afterFiles` |
| --- | --- | --- |
| Pages | generated-handler public guards, exact heavy rewrites | none |
| App | generated-handler public guards, exact heavy rewrites | default-locale normalization |

The two router families share generated-handler guards and exact heavy rewrites.
Only the App Router needs library default-locale normalization because the Pages
Router gets default-locale unprefixing from Next's built-in i18n.

## Winning rules

The intended priority is:

1. **Generated-handler public guards win first.**
   Direct browser access to generated handler URLs must return `/404`.

2. **Exact heavy-route rewrites win before broad normalization.**
   Heavy routes must enter generated handlers directly.

3. **Filesystem routes get their normal chance.**
   This matters for already-prefixed App routes and ordinary Pages catch-alls.

4. **App default-locale normalization runs last.**
   It handles remaining unprefixed default-locale App light routes.

This ordering avoids relying on rewrite chaining such as:

```
/docs/heavy -> /en/docs/heavy -> /docs/generated-handlers/heavy/en
```

Instead, the heavy route has its own exact rewrite:

```
/docs/heavy -> /docs/generated-handlers/heavy/en
```

and the broad App normalization handles the remaining light route:

```
/docs/light -> /en/docs/light
```

## Pages Router

Pages Router build behavior:

| request | winning library rule | result |
| --- | --- | --- |
| `/docs/generated-handlers/a/en` | `beforeFiles` guard | `/404` |
| `/docs/heavy` | `beforeFiles` exact heavy rewrite | `/docs/generated-handlers/heavy/en` |
| `/en/docs/heavy` | `beforeFiles` explicit default-locale alias | `/docs/generated-handlers/heavy/en` |
| `/de/docs/heavy` | `beforeFiles` non-default rewrite | `/docs/generated-handlers/heavy/de` |
| `/docs/light` | no library rewrite | Pages catch-all |
| `/de/docs/light` | no library rewrite | Pages catch-all with locale `de` |

Pages has no library `afterFiles` rewrite. Default-locale unprefixing is owned
by Next i18n.

## App Router

App Router build behavior for non-root multi-locale targets:

| request | winning library rule | result |
| --- | --- | --- |
| `/docs/generated-handlers/a/en` | `beforeFiles` guard | `/404` |
| `/docs/heavy` | `beforeFiles` exact heavy rewrite | `/docs/generated-handlers/heavy/en` |
| `/en/docs/heavy` | `beforeFiles` explicit default-locale alias | `/docs/generated-handlers/heavy/en` |
| `/de/docs/heavy` | `beforeFiles` non-default rewrite | `/docs/generated-handlers/heavy/de` |
| `/docs/light` | `afterFiles` App normalization | `/en/docs/light` |
| `/en/docs/light` | no library normalization | physical App `[locale]` route |
| `/de/docs/light` | no library normalization | physical App `[locale]` route |

App normalization is not emitted for single-locale configs. It is also not
emitted for root targets because a root catch-all normalization has no route
namespace and would need a fragile blacklist.

## Development proxy mirror

Development proxy mode does not install these Next rewrite buckets. It mirrors
the same priority at request time:

1. Check direct generated-handler source paths and rewrite them to `/404`.
2. Rewrite known or lazily discovered heavy routes to generated handlers.
3. For App only, normalize target-owned default-locale light or missing routes
   onto the physical `[locale]` route.
4. Pass everything else through to ordinary Next routing.

The proxy and adapter differ mechanically, but they preserve the same observable
priority: generated-handler guard first, exact heavy routing next, broad App
normalization last.
