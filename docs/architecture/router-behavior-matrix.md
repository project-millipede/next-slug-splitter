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
| Stale client page-manifest behavior | Historical dev-only issue in the Pages client router path. | No. | Pages client-router-specific behavior. |
| Dev-only 404 retry helper | Yes. The demo uses `useSlugSplitterNotFoundRetry(...)` from the Pages subpath. | Yes. The demo uses `useSlugSplitterNotFoundRetry(...)` from the App subpath. | The helpers are separate because the router transports differ. |
| Uses Pages data transport | Yes. The Pages helper probes with `x-nextjs-data: '1'`. | No. The App helper probes with ordinary HTML document requests. | The Pages helper does not carry over directly. |
| Temporary self-redirect when an existing generated handler was updated in place | Yes. | Yes. | This is a shared proxy/readiness safeguard, not a Pages-only workaround. |
| When the self-redirect applies | Primary HTML navigation request only. | Primary HTML navigation request only. | Data transport, `HEAD`, and non-HTML follow-up requests stay on the fast path. |
| Demo not-found behavior | `pages/404.tsx` performs the Pages dev retry flow. | `app/not-found.tsx` performs the App dev retry flow. | Both are development-only transient 404 workarounds. |

## 404 Retry Contract

The Pages and App retry helpers intentionally stay separate in implementation,
but they follow the same development-only contract:

1. A cold heavy request can reach the router's not-found boundary while Next is
   still warming the generated handler page.
2. The helper hides the not-found UI during a bounded readiness probe.
3. The helper probes the same public URL.
4. The helper retries the original browser URL once the route becomes ready.
5. If readiness never arrives, the normal not-found UI is shown.
6. Production builds do not use this path because generated handlers are already
   compiled before requests arrive.

The transport is router-specific and remains in the router-specific helper.

## Router Transport Difference

| Router | Boundary | Probe | Retry |
| --- | --- | --- | --- |
| Pages | `pages/404.tsx` | `HEAD` with `x-nextjs-data` | `router.replace(...)` |
| App | `app/not-found.tsx` | HTML `GET` | `window.location.replace(...)` |

## Shared Redirect Safeguard

The temporary self-redirect for updated generated handlers remains a separate
shared proxy/readiness safeguard.

It applies when lazy heavy preparation updates an existing generated handler in
place and the request is a primary HTML navigation request. That safeguard can
matter for either router family because it belongs to the shared dev proxy path,
not to either router-specific retry helper.

## Read More

- [`../README.md`](../../README.md#dev-mode-cold-start-behavior)
- [`../../demo/page-router/README.md`](../../demo/page-router/README.md#dev-404-retry-workaround)
- [`../../demo/app-router/README.md`](../../demo/app-router/README.md#dev-404-retry-workaround)
