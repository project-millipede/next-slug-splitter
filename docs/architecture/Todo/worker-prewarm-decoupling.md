# Decouple Worker Prewarm From The Dev Proxy Worker

This note captures a current architectural mismatch in the Next integration:

- the config surface makes `workerPrewarm` sound generic
- the implementation is currently specific to the dev-only proxy worker

The goal of this note is to make the policy and implementation boundaries
explicit before the system grows a second prewarm path.

## Current Problem

Today `workerPrewarm` is effectively bound to two things at once:

1. the proxy worker family
2. development-time proxy routing

That coupling exists because the only concrete prewarm implementation currently
lives in the proxy runtime:

- `src/next/proxy/runtime/prewarm.ts`
- `src/next/proxy/instrumentation/file-lifecycle.ts`

The generated startup bridge only survives when both conditions are true:

- routing strategy resolves to `kind: 'proxy'`
- proxy worker prewarm is enabled

That means the current policy shape overstates what the system can actually do.
`workerPrewarm` sounds like a general startup-prewarm switch for worker-backed
subsystems, but in practice it means:

- generate `instrumentation.ts`
- call the proxy-runtime prewarm helper
- create or reuse the dev-only proxy worker session

## Why This Matters

This coupling is workable while the proxy worker is the only prewarmable worker
family, but it becomes misleading in two ways:

1. naming

`workerPrewarm` suggests a worker-family-independent concept.

2. extension path

If another worker family later needs startup prewarm, the current design
encourages us to either:

- overload proxy-specific code with unrelated worker-family behavior, or
- duplicate the same policy meaning in a second place

## Current Worker Families

The repo currently has two real long-lived worker families:

1. proxy worker
2. App page-data worker

Only the proxy worker currently supports startup prewarm.

There are also a few shared comments that mention a build worker, but the repo
does not currently expose a concrete build-worker family in the same way it
does for the proxy worker or the App page-data worker.

## Desired Direction

Decouple the high-level prewarm intent from the current proxy-only startup
implementation.

The policy should answer:

- should startup prewarm run at all?

The worker-family layer should answer:

- which worker family, if any, participates in startup prewarm?
- which startup hook should trigger it?
- what exact session should be created or reused?

## Suggested Design Split

### 1. Keep one high-level prewarm intent

Keep a single app-level policy flag that expresses startup-prewarm intent.

That flag should not itself imply:

- proxy worker
- instrumentation bridge
- development-only behavior

Those are implementation decisions owned by lower layers.

### 2. Introduce worker-family-specific prewarm activation

Each worker family should explicitly opt in to startup prewarm support.

For each participating family, define:

- whether startup prewarm is supported
- which phase(s) may trigger it
- which startup entrypoint owns it
- what “ready” means for that family

### 3. Let the orchestration layer fan out the intent

A small orchestration layer should translate the high-level prewarm intent into
the currently supported concrete startup actions.

Today that orchestration would likely produce only one action:

- proxy worker startup prewarm through the generated instrumentation bridge

Later it could produce more than one action if another worker family becomes
prewarmable.

## Edge Cases To Preserve

### Proxy worker remains dev-only

The proxy worker is still intentionally tied to proxy routing and development
mode. Decoupling the policy does not mean the proxy worker itself suddenly
becomes a production/build worker.

Instead, the proxy implementation should remain gated by its own rules:

- proxy routing is active
- development phase allows proxy mode
- proxy startup prewarm is enabled by the orchestration layer

### App page-data worker later gets startup prewarm

If the App page-data worker later gets startup prewarm, add a second concrete
implementation path rather than extending the proxy prewarm helper to do two
different jobs.

That second path should define:

- its own startup trigger
- its own readiness boundary
- its own worker-session reuse rules
- its own cleanup behavior

It should not be smuggled through proxy-specific files like:

- `src/next/proxy/runtime/prewarm.ts`
- `src/next/proxy/instrumentation/file-lifecycle.ts`

### A future build worker gets startup prewarm

If a future build worker needs prewarm, it will likely need a different trigger
than runtime `instrumentation.ts`.

That is an important boundary:

- runtime startup prewarm is one trigger family
- build-time startup prewarm would be another

The shared policy may stay the same, but the startup entrypoint cannot be
assumed to be the same.

### More than one worker family may need prewarm

The orchestration layer should be able to express:

- no prewarm actions
- one prewarm action
- multiple independent prewarm actions

without forcing all worker families through one proxy-shaped API.

## Practical Refactor Goal

The next refactor should move the system from:

- one generic-sounding flag with one proxy-specific implementation

to:

- one high-level startup-prewarm intent
- one explicit proxy-worker implementation
- room for additional worker-family implementations later

That keeps the current proxy behavior intact while making future worker-family
support additive instead of tangled.

## Related Structure Cleanup

### `routing-strategy.ts` likely lives in the wrong shared folder

The current file path is:

- `src/next/shared/policy/routing-strategy.ts`

That placement is a little misleading.

The file does not define a reusable policy object in isolation. Instead, it
combines:

- resolved routing config
- environment override handling
- Next phase handling

to derive one concrete routing strategy.

So `policy/` is not a great fit for what the file actually does.

### Better fits

The best existing folder fit is probably:

- `src/next/shared/config/routing-strategy.ts`

because the file sits very close to config interpretation and strategy
selection, not request execution.

The cleanest long-term fit would be a dedicated folder such as:

- `src/next/shared/routing/`

with files like:

- `routing-policy.ts`
- `routing-strategy.ts`

That would make the ownership model clearer:

- `config/` owns raw config resolution
- `routing/` owns the semantic routing decision layer
- `runtime/` owns execution after the routing decision is already made

### Why this belongs in the same TODO

This structure issue is related to the prewarm-decoupling problem because the
same routing-strategy layer currently helps fuse together:

- high-level routing intent
- development-only proxy selection
- proxy-worker prewarm gating

Clarifying the folder ownership will make it easier to separate:

- generic routing intent
- generic startup-prewarm intent
- proxy-specific implementation details
