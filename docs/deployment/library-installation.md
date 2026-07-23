# Installing the Library for Deployments

> Prepare the current root library build for independently deployed repository
> applications

## Table of Contents

1. [Scope](#scope)
2. [Why `file:`](#why-file)
3. [Snapshot Refresh](#snapshot-refresh)
4. [Install Command](#install-command)
5. [Command Options](#command-options)
6. [Published Versions](#published-versions)

## Scope

Several independently deployed repository applications test the current
`next-slug-splitter` source rather than an already published release. They
declare the root library through a local `file:` dependency:

| Application                             | Purpose                                 |
| --------------------------------------- | --------------------------------------- |
| `demo/app-router`                       | Standalone App Router demonstration     |
| `demo/app-router-multi-locale`          | Splitter App Router benchmark target    |
| `demo/app-router-multi-locale-heavy`    | Unsplit App Router benchmark baseline   |
| `demo/page-router`                      | Splitter Pages Router benchmark target  |
| `demo/page-router-heavy`                | Unsplit Pages Router benchmark baseline |
| `integrations/frameworks/fumadocs-next` | Runnable Fumadocs integration           |

The website does not use this installation process. It consumes the four
benchmark targets over HTTP through its same-origin facade.

This document describes repository fixture infrastructure. Applications
consuming a published `next-slug-splitter` release do not need this custom
installation sequence.

## Why `file:`

pnpm's local dependency protocols have different behavior:

| Protocol      | Installation model                           | Application behavior                                                                                                                         |
| ------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace:*` | Links directly to the root workspace package | A new root build becomes visible immediately, but the application executes against the linked package and its workspace dependency context.  |
| `file:`       | Installs a package snapshot                  | The application receives a package-like installation in its own peer context, but the snapshot must be refreshed after the library is built. |

The repository intentionally exercises different Next.js and React versions.
Its demos and integrations should behave like applications using an installed
package rather than extensions of the root source workspace.

The `file:` protocol therefore provides the more appropriate current-source
test boundary. The cost is that building the root package does not update a
snapshot that pnpm has already installed.

## Snapshot Refresh

The root `dist` directory is generated and ignored by Git. A package snapshot
created before the root build therefore cannot contain the current build
output:

```text
Root library                                  Application installation
────────────                                  ────────────────────────

source without current dist
        │
        ├── first pnpm install ────────────►  file:
        │                                     snapshot without current dist
        ▼
build root dist
        │
        ├── no automatic refresh ──────────╳  installed snapshot
        │                                     still without current dist
        │
        └── final pnpm install ────────────►  refreshed file:
            --no-optimistic-repeat-install    snapshot with current dist
                                                      │
                                                      ▼
                                              application build
```

The final installation is part of correctness, not merely an installation
optimization.

## Install Command

The root `package.json` defines:

```json
{
  "scripts": {
    "install:library": "pnpm install --filter next-slug-splitter --frozen-lockfile --prod=false && pnpm build && pnpm install --frozen-lockfile --prod=false --no-optimistic-repeat-install"
  }
}
```

Most demo projects invoke it from their `vercel.json` with:

```json
{
  "installCommand": "pnpm --dir ../.. run install:library"
}
```

The deeper Fumadocs directory uses:

```json
{
  "installCommand": "pnpm --dir ../../.. run install:library"
}
```

The command performs this sequence:

1. Install the dependencies required to build `next-slug-splitter`.
2. Build the root library and generate the current ignored `dist`.
3. Perform the complete workspace installation without pnpm's optimistic
   repeat-install shortcut.
4. Refresh every application's installed `file:` package snapshot.
5. Return control to Vercel so the application build can begin.

Keep the committed Vercel Install Commands in effect while these applications
use `file:` dependencies.

## Command Options

| Option                           | Applied to    | Purpose                                                                                                                   |
| -------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `--filter next-slug-splitter`    | First install | Installs only the workspace package whose dependencies are required to build the root library.                            |
| `--frozen-lockfile`              | Both installs | Fails when package manifests and `pnpm-lock.yaml` disagree instead of changing the lockfile during deployment.            |
| `--prod=false`                   | Both installs | Disables production-only installation so regular and development dependencies, including root build tools, are available. |
| `--no-optimistic-repeat-install` | Final install | Forces pnpm to perform the repeat installation and refresh the newly built `file:` snapshots.                             |

The command preserves normal pnpm lifecycle-script behavior. It does not pass
`--ignore-scripts`.

## Published Versions

An exact published dependency is simpler when an application should represent
a finished library release:

```json
{
  "dependencies": {
    "next-slug-splitter": "5.3.0"
  }
}
```

The registry package already contains `dist`, so no root build or snapshot
refresh is required. Use an exact version rather than a range when a deployment
must remain reproducible.

The published version must exist before Vercel installs a commit that references
it. Once every deployed application uses a published version, remove its custom
Install Command and delete the shared `install:library` script.
