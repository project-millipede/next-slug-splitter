# Pages vs App Router Behavior Matrix

This note compares the current Pages Router and App Router behavior in the
areas where their development-time routing behavior can look similar from the
outside while still coming from different Next.js mechanisms.

The goal is to keep three categories separate:

1. Pages-Router-only client behavior
2. App-Router-specific behavior
3. shared dev-proxy readiness behavior that can affect either router family

## Quick Matrix

| Topic | Pages Router | App Router | Scope / Notes |
| --- | --- | --- | --- |
| Development lazy routing path | Uses the dev proxy path by default. | Uses the dev proxy path by default too. | This is shared library behavior in development. |
| Production routing path | Uses build-time generation plus rewrites. | Uses build-time generation plus rewrites. | Shared production model. |
| Stale client page-manifest bug | Yes. The repo applies a local Next patch for this. | No. This patch targets the Pages client router path only. | Dev-only. See `patches/next@16.2.0.patch`. |
| Dev-only 404 retry helper | Yes. The demo uses `useSlugSplitterNotFoundRetry(...)`. | No current equivalent helper is applied. | The current retry helper is Pages-Router-specific. |
| Uses Pages data transport | Yes. The current retry helper probes with `x-nextjs-data: '1'`. | No equivalent transport is used here. | This is one reason the retry helper does not carry over directly. |
| Temporary self-redirect when an existing generated handler was updated in place | Yes. | Yes. | This is a shared proxy/readiness safeguard, not a Pages-only workaround. |
| When the self-redirect applies | Primary HTML navigation request only. | Primary HTML navigation request only. | Data transport, `HEAD`, and non-HTML follow-up requests stay on the fast path. |
| Demo not-found behavior | `pages/404.tsx` performs the dev retry flow. | `app/not-found.tsx` is a plain not-found boundary. | This is current demo wiring, not proof that App Router can never see a similar transient 404. |

## Current Interpretation

### 1. Pages-Router-only stale manifest bug

This repo carries a local patch for a real development-time Pages Router issue:
the client-side page manifest can stay stale after the proxy has already
discovered and emitted a handler page lazily.

That patch is wired through:

- `pnpm-workspace.yaml`
- `patches/next@16.2.0.patch`
- the "Next.js Client-Side Page Manifest Patch" section in `README.md`

This mechanism is tied to the Pages client router path and does not currently
apply to App Router.

### 2. Pages-Router-only transient 404 retry helper

The current transient 404 retry helper is also Pages-Router-specific.

It works by:

1. landing on the demo's `pages/404.tsx`
2. probing the same route through the Pages data path
3. sending `x-nextjs-data: '1'`
4. retrying the browser navigation once the route starts responding

That logic lives in:

- `src/next/proxy/not-found-retry.ts`
- `demo/page-router/pages/404.tsx`

Because this helper is intentionally coupled to the Pages data transport, it is
not currently reused for App Router.

### 3. Shared proxy/readiness redirect safeguard

The temporary self-redirect for updated generated handlers is broader.

When lazy heavy preparation overwrites an existing generated handler file in
place, the proxy can already know the correct destination while Next/Turbopack
is still catching up to the updated module state for that route.

The current safeguard therefore:

1. detects that the handler was updated in place
2. checks whether the request is the primary HTML navigation request
3. converts the rewrite into one temporary self-redirect to the same public
   pathname

That logic lives in:

- `src/next/proxy/rewrite-readiness/redirect-policy.ts`
- `src/next/proxy/rewrite-readiness/navigation.ts`

This is not a Pages-only behavior. It belongs to the shared dev proxy/readiness
layer and can therefore matter for either router family when the request goes
through that path.

## What A Similar App Router 404 Means Today

If App Router shows a similar transient 404 in development, it should not be
explained away as:

- the stale Pages client page-manifest bug
- or the Pages-only `x-nextjs-data` retry path

Those two mechanisms are Pages-specific in the current repo.

The more plausible current explanations are:

- the shared proxy/readiness window around generated handler updates
- another App-Router-specific readiness issue that still needs its own
  dedicated diagnosis

## Documentation Rule Of Thumb

When describing router behavior in this repo:

- document the stale page-manifest patch as Pages-Router-only
- document the 404 retry helper as Pages-Router-only
- document the updated-handler self-redirect as shared proxy-mode behavior
- avoid using the current App demo's plain `not-found.tsx` as evidence that App
  Router can never hit a similar transient readiness window
