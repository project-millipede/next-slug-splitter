# Locale Routing

How `next-slug-splitter` maps a public URL to a page across the **Pages Router**
and the **App Router**: what gets rewritten, what generates a handler, and what
is simply served by the light catch-all.

Both routers reach the same end state — per-locale heavy handlers plus a single
light catch-all — but they get there through different *platform* mechanisms
(Pages has built-in i18n; App does not). This note keeps them side by side so the
differences are deliberate, not accidental.

## The base rule

> **Only heavy routes generate handlers and are rewritten to them. Light routes
> are never rewritten to a handler — they are served directly by the catch-all.**

A second, separate concern exists only because the App Router has no built-in
i18n: a **locale-normalization** rewrite that maps an unprefixed default-locale
URL onto the internal `[locale]` tree. That rewrite carries the locale prefix
only — it never points at a generated handler, and it never runs the generator
pipeline.

## Two orthogonal axes

| axis | per | values | decides |
| --- | --- | --- | --- |
| **Prefix** | locale | default → unprefixed, non-default → prefixed | the URL shape |
| **Generation** | route | heavy → pipeline + handler, light → catch-all | whether a handler is produced |

These are independent. A locale's prefix shape says nothing about whether a route
is heavy; heaviness says nothing about the prefix. All four combinations occur.

## Routing rewrites and guards

| class | derived from | needs the generator pipeline? | who emits / applies it |
| --- | --- | --- | --- |
| **heavy → handler** (`/de/docs/x → /docs/generated-handlers/x/de`) | content analysis (which routes are heavy + their handler paths) | **yes** | build: adapter → `next.config`; dev: proxy (lazy) |
| **locale normalization** (`/docs/:path* → /en/docs/:path*`) | config only (`defaultLocale` + `routeBasePath`) | **no** | build: adapter → `next.config`; dev: proxy (App only) |
| **generated-handler public guard** (`/docs/generated-handlers/:path* → /404`) | config only (`routeBasePath` + handler segment) | **no** | build: adapter → `next.config`; dev: proxy request guard |

The heavy rewrite is pipeline-derived and exists on both routers. The
locale-normalization rewrite is config-derived, pipeline-free, and **App-only** —
on the Pages Router, Next's built-in i18n does this job. The generated-handler
guard blocks direct browser access to internal handler URLs while still allowing
library-owned internal rewrites to reach those handlers.

## Why the two routers differ (platform, not choice)

- **Pages Router** uses Next's built-in i18n (`i18n` in `next.config`). The
  default locale is served **unprefixed** by convention (`/docs/foo` = default),
  non-default locales are prefixed (`/de/docs/foo`), and Next routes both to the
  catch-all automatically. The library only adds the heavy rewrites on top.
- **App Router** has **no built-in i18n** (the `i18n` config is Pages-only). The
  locale is a `[locale]` route segment, which is *mandatory* — so without help,
  every locale would be prefixed and there would be no unprefixed default. The
  library uses a single `[locale]` tree plus an internal rewrite that maps the
  unprefixed default onto `/<defaultLocale>/...`. That is the
  locale-normalization rewrite above.

Two non-idiomatic alternatives are explicitly rejected:
- **Two parallel trees** (`app/docs/[...slug]` + `app/[locale]/docs/[...slug]`) —
  works, but duplicates the catch-all and diverges from how Next expects i18n to
  be done.
- **Route groups** — `(name)` groups are URL-invisible; they cannot create or
  make-optional a locale prefix, so they cannot produce "default unprefixed +
  others prefixed." They only share boundary files.

## Combination matrix — multi-locale

> The App default-locale rows (5, 6) assume a non-root `routeBasePath`, such as
> `/docs`. Root App targets intentionally do not emit a catch-all normalization
> rewrite because `/` has no namespace that can safely scope the rule.

| # | Router | Locale | Route | Public URL | Locale-norm rewrite | Generator pipeline | Handler produced | Heavy → handler rewrite | Served by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Pages | default (en) | heavy | `/docs/foo` | — (Next i18n) | **run** | **yes** | yes (unprefixed + `/en` alias) | generated handler |
| 2 | Pages | default (en) | light | `/docs/foo` | — (Next i18n) | **skip** | no | no | `pages/docs/[...slug]` catch-all |
| 3 | Pages | non-def (de) | heavy | `/de/docs/foo` | — (Next i18n) | **run** | **yes** | yes (`/de` prefixed) | generated handler |
| 4 | Pages | non-def (de) | light | `/de/docs/foo` | — (Next i18n) | **skip** | no | no | catch-all (locale=de) |
| 5 | App | default (en) | heavy | `/docs/foo` | not needed; exact heavy rewrite wins | **run** | **yes** | yes (unprefixed → handler) | generated handler |
| 6 | App | default (en) | light | `/docs/foo` | **yes** → `/en/docs/foo` | **skip** | no | no | `app/[locale]/docs/[...slug]` catch-all |
| 7 | App | non-def (de) | heavy | `/de/docs/foo` | n/a (already prefixed) | **run** | **yes** | yes (`/de` prefixed → handler) | generated handler |
| 8 | App | non-def (de) | light | `/de/docs/foo` | n/a (already prefixed) | **skip** | no | no | `[locale]` catch-all (locale=de) |

Row 6 is the load-bearing case: **rewritten (locale only), pipeline skipped, no
handler** — the catch-all renders it.

## Dev vs build — same outcome, different mechanism

The outcome columns above are identical in dev and build. What differs is *when*
the pipeline runs and *how* the rewrites are applied.

| concern | dev (`proxy.ts`) | build (adapter → `next.config`) |
| --- | --- | --- |
| generated-handler public guard | request guard rewrites direct handler URLs → `/404` | `beforeFiles` guard rewrites |
| heavy → handler | **lazy**: analyze on cold request → emit handler → rewrite | **eager**: pipeline emits all handlers → bake rewrites |
| locale-norm rewrite (App) | proxy rewrites unprefixed light/missing default routes → `/en/…` | `afterFiles` rewrite, config-derived |
| light route | pass through (after locale-norm) — **no emit** | no rewrite — catch-all serves — **no emit** |
| generator pipeline | runs **lazily, heavy only** | runs **eagerly, heavy only** |

### Execution order (App, why the layers compose)

Next applies requests in this order:

```
headers → redirects → Middleware/proxy → beforeFiles rewrites → filesystem routes → afterFiles → dynamic → fallback
```

The detailed phase and priority rules live in
[`rewrite-phases.md`](./rewrite-phases.md). In short:

Build mode uses phase ordering instead of rewrite chaining:

1. `beforeFiles` blocks direct generated-handler URLs.
2. `beforeFiles` then gives exact heavy-route rewrites the first chance to
   route to generated handlers.
3. `afterFiles` finally applies the broad App default-locale normalization to
   the remaining light/default routes.

That ordering keeps the specific rules ahead of the broad rule:

```
/docs/heavy -> /docs/generated-handlers/heavy/en
/docs/light -> /en/docs/light
```

Dev proxy mode reaches the same outcome mechanically: it checks direct
generated-handler source paths first, rewrites heavy routes to generated
handlers, and only normalizes App default-locale light or missing target-owned
routes.

## Single-locale

The locale axis collapses: one default locale, unprefixed, **no `[locale]`
segment and no locale-normalization rewrite**.

| Router | Route | URL | `[locale]` segment | Locale-norm | Pipeline | Handler | Served by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pages | heavy | `/docs/foo` | — (no i18n) | — | run | yes | generated handler |
| Pages | light | `/docs/foo` | — | — | skip | no | `pages/docs/[...slug]` |
| App | heavy | `/docs/foo` | — (`app/docs/[...slug]`) | — | run | yes | generated handler |
| App | light | `/docs/foo` | — | — | skip | no | `app/docs/[...slug]` |

## Status

| aspect | Pages | App |
| --- | --- | --- |
| per-locale heavy handler emission | ✅ shipped | ✅ shipped (Part A) |
| locale-precise heavy/light split | ✅ shipped (Next i18n) | ✅ shipped (`deriveLocaleFromStaticParams` reads the locale param) |
| rewrite destination shape | ✅ i18n-prefixed | ✅ locale-less (locale lives in the generated leaf) |
| K = 1 merge | ✅ shipped | ⏳ planned (mirror of Pages) |
| generated-handler public guard | ✅ shipped | ✅ shipped |
| default-locale unprefixed | ✅ via Next i18n | ✅ shipped for non-root App targets |

App default-locale normalization remains an independent layer: it is not part of
heavy/light splitting and not a dependency of the `K = 1` merge. It is
config-derived and pipeline-free. It does not run for single-locale configs, and
root App targets intentionally emit no normalization rewrite because a root
catch-all would require an unsafe app-wide matcher.

## Legend

- **run / skip** — the generator pipeline (content discovery + heavy analysis +
  handler emission).
- **handler produced** — a generated `page.tsx` / `[[...rest]].tsx` exists.
- **heavy → handler rewrite** — pipeline-derived rewrite to that handler.
- **locale-norm rewrite** — config-derived (`defaultLocale` + `routeBasePath`),
  pipeline-free; App-only.

## References

- [Next.js — Internationalization (App Router uses `[lang]` + middleware)](https://nextjs.org/docs/app/guides/internationalization)
- [Next.js — `next.config` rewrites (beforeFiles / afterFiles / fallback)](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites)
- [`rewrite-phases.md`](./rewrite-phases.md) — the library's `beforeFiles` /
  `afterFiles` buckets and priority rules.
