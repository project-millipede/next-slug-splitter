# App Router Boundary Files

This note describes what the current App Router support does and does not
support for route-tree file conventions around the public catch-all page and
generated heavy handler pages.

The relevant current shape is:

```text
app/docs/[...slug]/page.tsx
app/docs/generated-handlers/.../page.tsx
```

The generated handler branch now uses one shared canonical segment:
`app/docs/generated-handlers`.

The key rule is simple: if a boundary file should apply to both the public
catch-all branch and the generated handler branch, it must live on a common
ancestor above the split point.

That common ancestor can be:

- `app/`
- `app/docs/`
- a user-owned route group such as `app/docs/(docs-shared)/`

Route groups are therefore optional. They are one App Router-native way to
create a narrower shared ancestor when `app/docs` itself would be too broad.

## Quick Matrix: Supported

| Pattern                            | Example                                                                  | Shared with generated handlers? | Notes                                                              |
| ---------------------------------- | ------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------ |
| App root boundary file             | `app/layout.tsx`                                                         | Yes                             | Applies to the whole app tree.                                     |
| Shared ancestor boundary file      | `app/docs/layout.tsx`                                                    | Yes                             | Both branches live under `app/docs`.                               |
| Shared ancestor loading/error file | `app/docs/loading.tsx`, `app/docs/error.tsx`                             | Yes                             | Same rule as `app/docs/layout.tsx`.                                |
| Route-group boundary file          | `app/docs/(docs-shared)/layout.tsx`                                      | Yes                             | Optional narrow shared subtree without changing the URL.           |
| Route-group loading/error file     | `app/docs/(docs-shared)/loading.tsx`, `app/docs/(docs-shared)/error.tsx` | Yes                             | Shared because both branches are children of the same route group. |

## Quick Matrix: Unsupported Or Anti-Pattern

| Pattern                                                      | Example                                                                                      | Shared with generated handlers? | Why not                                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| Catch-all local boundary file                                | `app/docs/[...slug]/layout.tsx`                                                              | No                              | Applies only to the `[...slug]` subtree.                                           |
| Catch-all local loading/error file                           | `app/docs/[...slug]/loading.tsx`, `app/docs/[...slug]/error.tsx`                             | No                              | Does not cross over to the sibling generated branch.                               |
| Route-group catch-all local boundary file                    | `app/docs/(docs-shared)/[...slug]/layout.tsx`                                                | No                              | Still local to `[...slug]`, even inside a route group.                             |
| Route-group catch-all local loading/error file               | `app/docs/(docs-shared)/[...slug]/loading.tsx`, `app/docs/(docs-shared)/[...slug]/error.tsx` | No                              | Route-group sharing only happens at the group level, not inside one child subtree. |
| Manual boundary file inside generated output                 | `app/docs/generated-handlers/layout.tsx`                                                     | Unstable                        | The generated handler branch is generator-owned output.                            |
| Auto-generated route group                                   | Library creates `(docs-shared)` for you                                                      | No                              | Route-group structure is app-owned today.                                          |
| Automatic mirroring from `[...slug]` into generated handlers | Copy `[...slug]/layout.tsx` into `generated-handlers`                                        | No                              | The library does not mirror boundary files today.                                  |

## Supported Patterns

### Pattern 1: Shared Ancestor Under `app/docs`

```text
app/docs/layout.tsx
app/docs/loading.tsx
app/docs/error.tsx
app/docs/[...slug]/page.tsx
app/docs/generated-handlers/.../page.tsx
```

Status: supported.

The boundary files live above the split point, so Next applies them to both the
public catch-all branch and the generated handler branch automatically.

### Pattern 2: Shared Ancestor At App Root

```text
app/layout.tsx
app/docs/[...slug]/page.tsx
app/docs/generated-handlers/.../page.tsx
```

Status: supported.

This is the broadest shared boundary. It applies to both branches because both
branches remain inside the same root app tree.

### Pattern 3: Route Group Shared By Both Branches

```text
app/docs/(docs-shared)/layout.tsx
app/docs/(docs-shared)/loading.tsx
app/docs/(docs-shared)/error.tsx
app/docs/(docs-shared)/[...slug]/page.tsx
app/docs/(docs-shared)/generated-handlers/.../page.tsx
```

Status: supported.

This is one good narrow shared subtree option when `app/docs` itself is too
broad. The route group does not appear in the URL, but its boundary files apply
to both child branches because both branches are children of the same
route-group node.

## Supported Today

### Shared Ancestor Boundary Files

Boundary files above the split point work automatically with no library change.

Examples:

- `app/layout.tsx`
- `app/docs/layout.tsx`
- `app/docs/loading.tsx`
- `app/docs/error.tsx`

Those files apply to both branches because both branches are inside the same App
Router subtree under `app/docs`.

### User-Owned Route Groups

Route groups are already compatible with the current App Router support as long
as the app owns that structure.

Example:

```text
app/docs/(docs-shared)/layout.tsx
app/docs/(docs-shared)/loading.tsx
app/docs/(docs-shared)/error.tsx
app/docs/(docs-shared)/[...slug]/page.tsx
app/docs/(docs-shared)/generated-handlers/.../page.tsx
```

This is an App Router-native way to share tree behavior between the public
catch-all branch and the generated handler branch when `app/docs` itself is too
broad. It is useful, but not required.

### Route-Group Local Boundary Files

Boundary files placed directly on the route group are shared by both branches.

Example:

```text
app/docs/(docs-shared)/layout.tsx
app/docs/(docs-shared)/loading.tsx
app/docs/(docs-shared)/error.tsx
app/docs/(docs-shared)/[...slug]/page.tsx
app/docs/(docs-shared)/generated-handlers/.../page.tsx
```

Those files are supported and work automatically because they sit on the common
route-group ancestor.

### Shared App Route Module Responsibilities

The shared App route module is the place for app-owned locale resolution, data
loading, metadata, and not-found behavior. It is not the mechanism for
`layout.tsx`, `loading.tsx`, or `error.tsx`; those remain App Router tree
conventions.

## Not Supported Today

### Segment-Local Boundary Files Under `[...slug]`

These files are local to the `[...slug]` subtree only:

- `app/docs/[...slug]/layout.tsx`
- `app/docs/[...slug]/loading.tsx`
- `app/docs/[...slug]/error.tsx`
- `app/docs/(docs-shared)/[...slug]/layout.tsx`
- `app/docs/(docs-shared)/[...slug]/loading.tsx`
- `app/docs/(docs-shared)/[...slug]/error.tsx`

Status: not shared with generated handlers.

They apply to the catch-all subtree, but they do not cross over to the sibling
generated handler branch.

### Automatic Mirroring Of Segment-Local Boundary Files

The library does not copy or generate matching boundary files from:

- `app/docs/[...slug]/layout.tsx`
- `app/docs/[...slug]/loading.tsx`
- `app/docs/[...slug]/error.tsx`
- `app/docs/(docs-shared)/[...slug]/layout.tsx`
- `app/docs/(docs-shared)/[...slug]/loading.tsx`
- `app/docs/(docs-shared)/[...slug]/error.tsx`

into:

- `app/docs/generated-handlers/...`
- `app/docs/(docs-shared)/generated-handlers/...`

If a boundary file exists only under `[...slug]`, it applies only to that
subtree and not to the sibling generated handler branch.

### Auto-Generated Route Groups

The library does not rewrite the app tree to introduce route groups
automatically. If an app wants a shared group such as `(docs-shared)`, that
group is app-owned structure.

### Persistent Manual Files Inside The Generated Handler Branch

The generated handler directory is generator-owned output. It is cleared and
re-written when handlers are emitted, so user-authored boundary files placed
directly inside `generated-handlers` are not a stable integration point.

## Recommended Structure

If shared behavior should apply to both the public catch-all route and generated
heavy handlers:

1. put shared boundary files on a common ancestor such as `app/docs`
2. if that is too broad, introduce a user-owned route group that contains both
   branches
3. if using a route group, put the shared boundary files on the route group
   itself
4. avoid placing shared boundary behavior only under `[...slug]`

## When Route Groups Are Useful

Route groups are optional. They are useful when shared behavior should apply to
both branches, but placing that behavior directly on `app/docs` would be too
broad.

They use App Router's native tree semantics instead of simulating them after
generation.

Compared with automatic mirroring, route groups have these advantages:

- Next applies the same boundary files naturally from one shared subtree
- no copying or synchronization is needed
- relative imports and subtree-local assumptions stay app-owned
- `error.tsx` remains attached to the tree Next actually renders

## Future Work

Automatic mirroring could be explored later, but it is intentionally out of
scope for the current App Router support.

That future work would need to answer at least:

- which file conventions are mirrored
- how mirrored files are kept in sync
- how relative imports remain valid
- how user edits inside generated output are treated
- how `error.tsx` semantics stay correct across the split
