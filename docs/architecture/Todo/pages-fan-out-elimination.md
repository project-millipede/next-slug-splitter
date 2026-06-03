# Eliminate The Pages Prerender Fan-Out

This note describes how to fix the Pages Router prerender fan-out **properly**,
so we can drop the `notFound` runtime guard described in the sibling design note
`locale-aware-handler-ownership.md` instead of shipping it.

The guard makes wrong-locale output *correct* (it returns `notFound`) but it
does not make the build *efficient* — every non-owned locale pass still runs.
The goal here is to stop those passes from ever being scheduled.

> **Unmerged context.** `locale-aware-handler-ownership.md` and the guard symbols
> named below (`handlerLocale`, `isCrossLocaleInvocation`,
> `localeConfig.localeParamName`) live in **uncommitted stash work**, not in the
> current tree — `git grep` will not find them. They are referenced for whoever
> holds that stash; this doc otherwise stands alone.

The work splits cleanly into two phases:

- **Phase 1 — fan-out elimination.** Pages-only, self-contained, parity-clean.
  Drives prerenders `H·L → H`. This is the shippable change and the bulk of
  this doc.
- **Phase 2 — file-count merge.** Optional, spans **both** routers, gated on a
  shared component set. Drives file count `H → 1` for eligible slugs. Strictly a
  follow-up; Phase 1 does not depend on it.

## Notation

| sym | meaning |
|-----|---------|
| **L** | configured i18n locales (`i18n.locales`) |
| **H** | *heavy* locales for a given slug — the locales where it carries heavy content (light excluded). `H ≤ L` |
| **K** | *distinct* heavy component-sets among the H heavy locales. `K ≤ H` |

These three are independent: `L` is global config, `H` is per-slug (which
locales are heavy), `K` is per-slug (how many genuinely different component sets
the heavy locales resolve to).

**Phase-1 emission is a function of `(L, H)` only.** `K` is *inert* to Phase-1
emission — it changes neither the file count nor the rule. `K` decides only (a)
the *contents* of each per-locale file (shared vs distinct import lists) and (b)
whether **Phase 2** can merge a group of locales. Do not branch Phase-1 emission
on `K`.

> An earlier draft of this doc used `K` to mean "heavy locales". That quantity
> is now **`H`**; `K` is reclaimed for *distinct component sets*, which is the
> axis that decides Phase-2 mergeability.

## Background — Why The Fan-Out Happens

Next.js i18n prerenders a **fixed-path** `getStaticProps` page once per
`i18n.locales` entry, unconditionally. Our generated handler pages are
fixed-path: the slug is baked into `handlerSlug` and the locale into the file
path, so each handler is a concrete page with no dynamic segment.

For a slug that is heavy in `H` of `L` locales:

- We emit `H` handler files (one per owned `(locale, slug)` pair).
- Next fans each file across all `L` locales.
- Total: `H` files × `L` locale passes = **`H·L`** `getStaticProps` invocations.
- Only `H` of those are useful.

**Empirically confirmed.** The single `pidp/use-case/recognition` slug — heavy
in `en` + `de`, with `L = 2` — produces **4** routes in
`.next/prerender-manifest.json`. That is exactly `H·L = 2 × 2 = 4`, of which
only `H = 2` are wanted. The dynamic `import('../../../../[...slug]')` in the
delegation is irrelevant to this count; the fan-out is purely a property of the
fixed page × i18n.

The stashed `handlerLocale` guard converts the `H·L − H` non-owned passes into
`{ notFound: true }`. That removes the wrong-locale artifacts but still pays for
every pass. It is a workaround, not the fix.

## Governing Formula

```
prerenders today = H · L          fixed file per heavy locale, each fans out over all L
prerenders goal  = H              one useful prerender per heavy locale
wasted today     = H · (L − 1)

files (Phase 1) = H               one per heavy locale — matches App's granularity
files (Phase 2) = 1               iff the heavy locales share one set (K = 1); else stays H
```

Read it as two independent reductions:

- **Phase 1** (enumeration) drives **prerenders** `H·L → H` and leaves the file
  count at `H`. `H` files is the *parity floor* — App emits per-locale files
  too, so this matches App's granularity exactly.
- **Phase 2** (merge) optionally drives the **file count** `H → 1`, but only for
  slugs whose heavy locales share one component set (`K = 1`), and only if the
  *same* merge is applied to App — otherwise the two routers diverge in source
  granularity. File count is **never** reduced via a fixed page (that
  re-introduces the fan-out — see "Why Each Form…").

## The Core Idea — Enumerate, Don't Guard

Make each generated handler page (at `L > 1`) export `getStaticPaths` that lists
**exactly** the `(path, locale)` pair it owns, with an explicit `locale` and
`fallback: false`.

Next's contract: when a path in `getStaticPaths` sets `locale`, only that locale
is generated for it; locales are **not** fanned out. So enumerating the owned
pairs reduces `H·L → H`, and the runtime guard becomes redundant — non-owned
locales are never enumerated, therefore never invoked.

### Cross-router parity invariant

The generated **heavy handlers must be identical in *end result*** per
`(locale, slug)` across both routers, at matching granularity (per-locale, `H`
files). All legitimate divergence is confined to two buckets:

1. **Light-route complement** — how each router serves the *non-heavy* routes
   (Pages light catch-all vs App light catch-all).
2. **Next-mandated plumbing** — the leaf name (`[[...rest]].tsx` vs `page.tsx`)
   and the data hook (`getStaticProps` vs `loadPageProps` / `generateMetadata`).

Anything else diverging is a bug, not a design choice.

### How App reaches the same outcome

App reaches "build exactly the owned pairs and nothing extra" by a different
route. Being precise here stops anyone from hunting for an enumeration API in
the App page output that does not exist:

- App Router has **no built-in i18n routing** (no `i18n` config block), so it
  does not auto-prerender a fixed page once per locale. **App never has this
  fan-out in the first place.**
- The generated App **page** is fully **concrete**: params baked into a
  `handlerParams` constant, passed to `loadPageProps` / `generateMetadata`, with
  `export const dynamicParams = false`. The *page* uses neither `getStaticPaths`
  nor `generateStaticParams`.
- **But App is not innocent of `generateStaticParams`** — it uses it on the
  **light catch-all**, via `withHeavyRouteStaticParamsFilter`, to **subtract**
  heavy routes from the light path. This is the *inversion* of Pages: Pages
  *adds* `getStaticPaths` to the heavy handler to *restrict* it; App *filters*
  `generateStaticParams` on the light route to *exclude* the heavy slugs.
- **Empirically, App emits per-locale files** — e.g.
  `generated-handlers/guides/einfuehrung/de/page.tsx`. So `H` files is already
  App's granularity; Phase 1 matches it, it does not introduce it.

**Locale-coarse caveat (App-side bug, flag it).** App's
`deriveLocaleFromStaticParams` returns `localeConfig.defaultLocale` regardless of
the entry, so App's heavy-route *subtraction* is locale-blind and can diverge
from Pages' locale-precise filtering for per-locale-divergent slugs. Fix: thread
the per-entry locale through the wrapper's `args`. Orthogonal to the fan-out
fix, but it lives in the same parity story.

## Constraint — `getStaticPaths` Needs A Dynamic Segment

`getStaticPaths` is only legal on a page that has a dynamic route segment. Our
handler pages are fixed-path today, so each one that must enumerate has to move
under a dynamic segment to be allowed to export it.

This creates a tension:

- **Bundle isolation** wants one file per `(locale, slug)` with a *static*
  import set (the whole point of the library).
- **A dynamic segment** normally implies one shared file serving many paths,
  which would force a union of imports.

### Resolution — concrete by default, `[[...rest]]` only when `L > 1`

The dynamic leaf is a **last resort, used only when it is load-bearing**:

- **`L = 1` → concrete file.** Emit today's concrete file —
  `${handlerRelativePath}.${ext}`, i.e. `<slug>/<locale>.tsx`, or `<slug>.tsx` in
  default-locale mode (no locale leaf). No `[[...rest]]`, no `getStaticPaths`. At
  `L = 1` there is no fan-out to fix, so the machinery buys nothing. This mirrors
  App's concrete `page.tsx`. **Single-locale apps need no change at all.**
- **`L > 1` → per-locale `[[...rest]]`.** The fan-out exists; suppressing it
  requires `getStaticPaths` with an explicit `locale` + `fallback: false`, which
  requires a dynamic base-matching leaf. Emit `<slug>/<locale>/[[...rest]].tsx`,
  one per heavy locale, each pinning its own locale.

**The trigger is `L > 1`, not `K`.** `K` never decides the leaf shape — proof by
the corners: `K = 1` (uniform) at `L > 1` *still* needs `[[...rest]]` (it must
pin locales); `K = H` (all different) at `L = 1` needs **none** (no fan-out).
"Last resort" means *forced-only*, not *rare*: in a multi-locale app
`[[...rest]]` is used for **every** heavy handler; in a single-locale app, never.

Why `[[...rest]]` is the only dynamic shape that works (when one is forced):

- `[locale]` / `[loc]` (single dynamic) — collapses all locales of a slug into
  one file, forcing a union of imports when sets differ per locale. It also
  double-encodes the locale (route param **and** i18n axis). Rejected as the
  per-locale leaf. *(It is, however, exactly the App-side Phase-2 merge leaf —
  see Phase 2.)*
- `[...rest]` (required catch-all) — does not match the base path, but the
  rewrite destination *is* the base, so it would never resolve. Rejected.
- `[en].tsx` / `[de].tsx` — brackets denote a param **name**, not a literal
  value: `[en]` matches *any* segment as `params.en`. Two such siblings are a
  hard build error (*"You cannot use different slug names for the same dynamic
  path"*). Not a real option.
- `[[...rest]]` (optional catch-all) — matches the base with empty params
  (`rest: []`), keeps one file per owned `(locale, slug)`, and is the **only**
  leaf that is both dynamic *and* matches the bare base. Chosen for `L > 1`.

Per-locale `[[...rest]]` keeps full bundle isolation: each file sits in its own
static `<locale>/` folder and imports only that locale's components. Despite the
name, the catch-all is **vestigial** here — `rest` is always `[]` (the bare
base); we borrow the optional catch-all purely for its *matches-the-base +
can-export-`getStaticPaths`* property, never for variable-depth paths.

### Two optional-catch-all properties to respect

Choosing the *optional* catch-all is correct, but it carries two behaviors a
required catch-all does not:

- **It owns its folder's index → collision invariant.**
  `interactive/en/[[...rest]].tsx` *is* the route for `/…/interactive/en`, so
  Next throws a build error if anything else serves that same path — e.g. an
  `index.tsx` in the same folder: *"You cannot define a route with the same
  specificity as a optional catch-all route."* The generated tree is exclusively
  ours, so this holds — but it is now a rule: **never emit an index alongside
  the `[[...rest]]` leaf in the same generated folder.** (No cross-router issue:
  Pages and App write to separate generated trees.)
- **It matches greedily.** `[[...rest]]` also matches arbitrarily deep paths
  (`/…/interactive/en/a/b`). `fallback: false` plus our single enumerated entry
  means only the bare base is *built* and anything deeper 404s, and Next
  resolves most-specific-first so a longer sibling slug should win its own path.
  Greedy matching over nested slugs is still where surprises hide — see the
  shadowing check in the validation list.

## `getStaticPaths` Shapes

**Concrete (`L = 1`).** No `getStaticPaths` at all — a fixed page with no
dynamic segment, one locale, no fan-out.

```ts
// file: <slug>/<locale>.tsx        // no getStaticPaths
```

**Per-locale (`L > 1`, Phase 1).** Locale lives in the static folder *and* in
the `getStaticPaths` `locale` field; `rest` is vestigially `[]`. Bundle
isolation preserved (en never ships de's components).

```ts
// file: <slug>/en/[[...rest]].tsx
{ paths: [{ params: { rest: [] }, locale: 'en' }], fallback: false }
```

**Merged (Phase 2, `K = 1`).** One locale-less file serves a group of same-set
locales; the locale rides the i18n `locale` field, so `rest` stays `[]` for
*every* entry (no double-encoding — the locale is **not** a path segment).

```ts
// file: <slug>/[[...rest]].tsx
{ paths: [{ params: { rest: [] }, locale: 'en' },
          { params: { rest: [] }, locale: 'de' }], fallback: false }
```

## Why Each Form Kills (Or Tolerates) The Fan-Out

- **Fixed file** (`<slug>.tsx`) *cannot* suppress fan-out — Next always
  prerenders it once per configured locale, i.e. `L` times. This is acceptable
  **only at `L = 1`** (the concrete file: `L` passes = the 1 wanted pass). At
  `L > 1` a fixed file over-prerenders — it re-introduces the very fan-out this
  doc exists to kill — and, when a light locale exists, it **shadows the light
  route**. So a fixed file is forbidden at `L > 1`, even when `H = L`. (The
  earlier "benign at `H = L`" collapse is rejected on both counts: it relies on
  the fan-out *coincidentally* building exactly the wanted locales, and it
  breaks App parity by emitting one file where App emits `H`.)
- **Dynamic `[[...rest]]` + `getStaticPaths(fallback: false)`** restricts
  prerendering to exactly the enumerated `(params, locale)` pairs. Non-enumerated
  locales are never scheduled, so prerenders = `H` and the runtime guard is
  redundant. This is the mechanism that turns the fan-out off for every `L > 1`.

## Emission Decision Matrix (Phase 1)

The rule is a function of `(L, H)` plus whether each locale is heavy. `K` does
**not** appear — it changes file *contents*, never the file *count* or the rule.

| condition | Phase-1 emission |
|---|---|
| locale not heavy | emit nothing for it — the **light route** serves it |
| `L = 1`, heavy | today's concrete file `${handlerRelativePath}.${ext}` — no `getStaticPaths` |
| `L > 1`, heavy | `<slug>/<locale>/[[...rest]].tsx` + `getStaticPaths` pinning that locale (one file per heavy locale) |

Worked through for a single slug at `L = 2` (locales `en`, `de`) — note the
bottom two rows are **both** `H = 2` (both heavy, both emit a real handler);
only `K` separates them, and `K` is a Phase-2 concern:

| heavy status | K | Phase-1 emit | prerenders today → goal | Phase-2 |
|---|---|---|---|---|
| neither heavy | — | nothing; light route serves both | 0 → 0 | — |
| **en only** (H=1) | — | `en/[[...rest]]`; `/de/…` → light route | 2 → 1 | n/a (single file) |
| both, **same** set (H=2, K=1) | 1 | 2× per-locale `[[...rest]]`, identical-except-locale | **4 → 2** | mergeable → 1 (both routers) |
| both, **different** sets (H=2, K=2) | 2 | 2× per-locale `[[...rest]]`, **wholly different bodies** | **4 → 2** | **not** mergeable — stays 2 |

The two `H = 2` rows emit the *same shape* (per-locale `[[...rest]]`, two files,
two builds). They differ only in file **contents**: at `K = 1` the two files are
identical bar the locale marker; at `K = 2` they share only the skeleton
(`[[...rest]].tsx`, `getStaticPaths` pinning their locale, `fallback: false`) —
imports, component entries, factory bindings and `handlerParams` are entirely
different. Both are full heavy emissions.

## Implementation Sketch (Phase 1)

Ship per-locale enumeration first — it kills the fan-out (`H·L → H`) with no
set-equivalence analysis. Branch on `L`:

1. **Runtime helper** — `src/next/pages/handler-static-props.ts`
   - Add `export const HANDLER_CATCHALL_PARAM = 'rest';`.
   - Add `createHandlerGetStaticPaths(entries)` taking explicit
     `Array<{ rest: string[]; locale: string }>` and returning
     `{ paths: entries.map(({ rest, locale }) => ({ params: { [HANDLER_CATCHALL_PARAM]: rest }, locale })), fallback: false }`.
     (Explicit entries keep test fixtures trivial — no resolution wrapper.)
2. **Emitter** — `src/generator/pages/protocol/emitters.ts`
   - When `L > 1`: emit
     `export const getStaticPaths = createHandlerGetStaticPaths([{ rest: [], locale: '<sourceLocale>' }]);`.
   - When `L = 1`: emit nothing extra (the concrete page is today's output).
3. **File location + config threading** — `src/generator/pages/protocol/rendered-page.ts`
   - `resolveRenderedHandlerPageLocation` today takes only
     `(paths, emitFormat, handlerRelativePath)` and hard-codes
     `${handlerRelativePath}.${ext}` — it receives **no** `localeConfig`/locale
     count, so there is nothing to branch on yet. Thread in `L` (or a derived
     `useDynamicLeaf` boolean).
   - When `L > 1`: emit under `${handlerRelativePath}/[[...rest]].${ext}`.
   - When `L = 1`: keep today's concrete `${handlerRelativePath}.${ext}`.
   - **This location helper is shared by four call sites — update every one with
     the new argument:** eager `src/generator/pages/target/handlers.ts`
     (`renderRouteHandlerPage`); lazy emit
     `src/next/proxy/lazy/single-handler-emission.ts` (both
     `renderRouteHandlerPage` *and* `resolveRenderedHandlerPageLocation`); and
     **stale-output cleanup** `src/next/proxy/lazy/stale-output-cleanup.ts`. If
     cleanup keeps deriving the old `${handlerRelativePath}.${ext}` location while
     emission writes the `[[...rest]]` form, stale handler files are never
     removed.
   - The **emitter** (step 2) likewise gets no `L` today — thread it through
     `renderRouteHandlerModules` / its render config so it can decide whether to
     emit `getStaticPaths`.
4. **Delegation unchanged** — `getStaticProps` still overwrites the route param
   from the baked `handlerSlug`; the incoming `rest: []` param is ignored.
   `buildDelegatedParams` (`handler-static-props.ts`) does
   `{ ...ctx.params, [handlerRouteParam.name]: value }` — the baked param is set
   **after** the spread, so the fixed slug wins even if the source param were
   itself named `rest` (the leaf's `rest: []` is simply overwritten). A name
   clash is therefore benign, not a hard invariant to enforce.
5. **Drop the guard** — remove the stash's Pages half
   (`handlerLocale` option + `isCrossLocaleInvocation`); it is now redundant.
6. **Rewrites — no change** — `src/next/shared/rewrites/index.ts` builds the
   destination from `handlerRelativePath`, which stays the route-resolving
   directory (e.g. `interactive/en`). The optional catch-all resolves that base,
   so destination strings are byte-for-byte identical.

## Why The Guard Becomes Redundant

Non-owned locales are never enumerated, so Next never invokes the handler for
them, so there is nothing to short-circuit. The build emits exactly `H`
artifacts and runs exactly `H` `getStaticProps` invocations. Correctness comes
from *not generating* the wrong locale rather than from *rejecting* it at
request time.

## Validation Checklist (Next 16.2)

These cannot be proven from source and must be confirmed before relying on the
approach:

1. **Empty optional catch-all shape** — whether `getStaticPaths` wants
   `{ rest: [] }` or `{ rest: false }` to prerender the base of `[[...rest]]`.
   One build run settles it.
2. **Rewrite composition** — whether a `beforeFiles` rewrite with `locale:false`
   (manual `/<locale>/...` prefix) resolves to the page that `getStaticPaths`
   built *for that explicit locale* at the identical destination path.
3. **Fan-out actually suppressed** — a prerender-count assertion confirming
   explicit `locale` yields `H` builds, not `H·L`. *(The `H·L` baseline is
   already confirmed: 4 routes for the `recognition` slug — this item confirms
   the enumerated build drops it to `H`.)*
4. **Dev/proxy parity** — lazy single-file emission shares `rendered-page.ts`,
   so it will emit the `[[...rest]]` file automatically at `L > 1`; smoke-test
   that `fallback:false` behaves under the dev server.
5. **No sibling shadowing** — with a shorter slug and a longer slug that shares
   its prefix, confirm each builds and serves its own path and the shorter
   slug's greedy `[[...rest]]` does not capture the longer one (relies on Next's
   most-specific-first resolution + `fallback: false`).
6. **Phase-2 merge parity** *(Phase 2)* — confirm a locale-less Pages
   `<slug>/[[...rest]]` enumerating `L` locales and the App
   `<slug>/[locale]/page.tsx` mirror build the **same** routes and **both** emit
   one file (source-granularity parity preserved).
7. **Phase-2 merged greedy isolation** *(Phase 2, ‡)* — confirm a merged
   `<slug>/[[...rest]]` enumerating multiple locales coexists with a sibling
   `<slug>/<otherLocale>/[[...rest]]` without either shadowing the other.

## Edge Cases To Preserve

- **Default-locale content mode** (`contentLocaleMode === 'default-locale'`):
  `handlerRelativePath` has no locale leaf. At `L > 1` the file becomes
  `interactive/[[...rest]].tsx` with `getStaticPaths` enumerating
  `[{ params: { rest: [] }, locale: defaultLocale }]`; at `L = 1` it is the
  concrete `interactive.tsx`.
- **Single-locale apps** (`L = 1`): keep today's concrete
  `${handlerRelativePath}.${ext}` (locale leaf present or absent per
  `contentLocaleMode`), no `getStaticPaths`, no `[[...rest]]`. **Nothing
  changes** — there is no fan-out.
- **Default vs non-default locale paths**: the default locale is publicly
  reachable **unprefixed**, but build/manifest entries may be **locale-prefixed**
  — a Next 16.2.0 probe showed default-locale SSG routes stored as `/en/…` while
  runtime served both unprefixed and `/en/…`. The `getStaticPaths` `locale` field
  must align with the path Next *actually* prerenders for each; confirm via
  validation item #2 rather than assuming the unprefixed form.
- **Source route-param kind** (`single` / `catch-all` / `optional-catch-all`)
  is independent of the generated leaf — which is *concrete* at `L = 1` and an
  *optional catch-all* at `L > 1`. Delegation resolves the source param from the
  baked slug regardless.

## Relationship To The Stashed Work

- **Drop**, do not restore, the stash's Pages half (`handlerLocale` guard +
  test) once enumeration lands — enumeration supersedes it.
- **Keep** the stash's App half (`localeConfig.localeParamName` derivation). It
  is orthogonal to fan-out and independently useful (and overlaps the
  locale-coarse fix noted above).

## Phase 2 — File-Count Merge (Both Routers, `K = 1`-Gated)

Phase 1 leaves `H` files per heavy slug — the *parity floor* with App. Reducing
the **file count** below `H` is a separate, opt-in layer that:

1. requires set-equivalence analysis across locales (the `K` axis), and
2. **must be applied to *both* routers together** — merging Pages alone would
   make Pages emit one file where App still emits `H`, breaking source
   granularity. (Built-route *output* stays identical either way; the *source
   file count* would not.)

### Why you might want it — and why you might not

**The cost Phase 1 leaves.** At `L > 1`, Phase 1 emits `H` per-locale
`[[...rest]]` files per heavy slug. For shared-set locales (`K = 1`) those files
are byte-identical except the locale marker — pure source-tree duplication. In a
many-locale app, *every* heavy slug spawns `H` near-identical `[[...rest]]`
leaves. If that proliferation is itself a maintenance pain, Phase 2 removes it
(`H → 1`).

**Why you might not need it.** Duplication ≠ bloat. Each per-locale file is
runtime-free: every built page loads only its own component set, identical
whether it came from one merged file or `H` separate ones. Builds are already
minimal (`H`) after Phase 1, and App emits per-locale files too — so `H` files
is the *normal, parity-matched* shape, not an anomaly. Phase 2 therefore buys
**source tidiness** — no **prerender / `getStaticProps`-count** win and no
runtime win. (It does remove `H − 1` page-wrapper modules per merged slug, which
can trim compile/bundle time marginally, but shared components compile once
either way.)

| aspect | Phase 1 (per-locale) | Phase 2 (merged, `K = 1`) |
|---|---|---|
| source files per shared-set slug | `H` | **1** |
| prerender builds | `H` | `H` *(unchanged)* |
| runtime bundle per built page | one locale's set | same — one locale's set |
| cross-router parity | preserved (`H` files both) | preserved **only if both routers merge** |
| added cost | — | a dynamic-segment guard on both routers |

**Verdict:** reach for Phase 2 only if source-file / `[[...rest]]` proliferation
is a pain in its own right. Otherwise Phase 1 is complete — Phase 2 is optional
polish, gated on `K = 1`, and never worth breaking parity for.

The merge collapses the `H` per-locale files of a shared-set group into one,
using each router's native enumeration:

| | per-locale (Phase 1 / `K > 1`) | merged (`K = 1`) |
|---|---|---|
| **Pages** | `H`× `<slug>/<locale>/[[...rest]].tsx`, `getStaticPaths` pins one locale | 1× `<slug>/[[...rest]].tsx`, `getStaticPaths` enumerates all locales (`{rest:[], locale}` per entry) |
| **App** | `H`× `<slug>/<locale>/page.tsx` (concrete) | 1× `<slug>/[locale]/page.tsx`, `generateStaticParams` enumerates locales, `dynamicParams = false`, locale read from the route param into `handlerParams` |

Both merges collapse `H` files → 1, both still build `H` routes, both stay fully
static. **`K` is a property of the content, not the router** — the component set
for a given `(slug, locale)` comes from the same source feeding both sides — so
merge-eligibility is *identical* across routers. They merge in lockstep, which
is exactly what keeps parity intact rather than coincidental.

### Implementation note — the merge is build-only (dev never groups)

The `K = 1` merge runs only on the **eager build path**. The lazy dev/proxy path
emits one route at a time and never groups, so dev keeps the per-locale Phase 1
shape. Dev and build therefore differ in generated *file layout* for `K = 1`
slugs; the *rendered output* is identical, and generated files are
gitignored/ephemeral and full-cleared on phase transitions, so the layout
difference is inert. (Pages implements this today; the App half is Phase 2b.)

This is a deliberate asymmetry, not an oversight: the eager build already
analyzes every locale variant to find heavy routes, so grouping is a free
in-memory comparison of data it already holds and scales to any locale count.
The lazy path reads exactly the one requested variant, so it must never reach
for the full per-slug locale set the merge needs.

| axis           | dev (`next dev`)           | build (`next build`)             |
|----------------|----------------------------|----------------------------------|
| route strategy | proxy → lazy               | rewrites → eager (`generate`)    |
| when emitted   | one handler per request    | whole heavy-route set up front   |
| `K = 1` merge  | never (per-locale Phase 1) | groups each `K = 1` set into one |
| rendered out   | per-locale content         | identical per-locale content     |

Rules:

- **Only when `K = 1`** for the group (the heavy locales genuinely share a
  component set). At `K > 1`, merging forces union imports and bloats every page
  — skip it; stay per-locale on both routers. Only a shared-set *subset* of a
  slug's locales may merge; the rest stay separate.
- **Trade:** fewer files for a dynamic segment guarded by `fallback: false`
  (Pages) / `dynamicParams = false` (App). Both swap fully-concrete simplicity
  for one more guard that must stay correct.
- **‡ unproven risks** (absent from the per-locale form): greedy matching of the
  merged Pages `[[...rest]]` against sibling folders (checklist #7); rewrite
  composition for the merged destination.

The proven default for any slug remains Phase 1 (`H` files, full isolation,
parity with App). Treat Phase 2 as a measured, symmetric trade — never a
default, never one-sided.

## Suggested Sequence

1. Prove validation item #1 with a throwaway `[[...rest]]` build.
2. **Phase 1**: land the runtime helper + emitter + file-location change —
   concrete at `L = 1`, per-locale `[[...rest]]` + `getStaticPaths` at `L > 1` —
   behind tests.
3. Delete the Pages guard.
4. Verify rewrite composition and prerender counts on a multi-locale fixture
   (items #2 and #3).
5. *(Later, optional)* **Phase 2**: layer in set-equivalence (`K`) analysis and
   the symmetric both-router merge — Pages locale-less `[[...rest]]` + App
   `[locale]/page.tsx` (items #6, #7).
