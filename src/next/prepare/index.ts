/**
 * App-owned preparation execution for the Next integration.
 *
 * @remarks
 * This file is the operational entrypoint for the preparation-cache group.
 * The cache decision itself lives in `prepare-cache.ts`, but this module owns
 * the real execution of preparation tasks once the cache layer says a task is
 * stale and must run.
 *
 * There are two distinct concerns here:
 * - execution semantics: spawn the command or TypeScript compiler correctly
 * - in-process deduplication: if multiple callers ask for the same resolved
 *   preparation set in one process, they share the same in-flight promise
 *
 * Consumer-facing runtime code reaches this file from multiple places:
 * - adapter rewrite generation
 * - runtime config loading
 * - lookup fallback preparation
 *
 * That makes this file the clearest "prepare cache entrypoint" in the system.
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

import { createRuntimeError } from '../../utils/errors';
import { resolveRouteHandlerPreparations } from '../config/app';
import { getResolvedPreparationExecutionState } from './cache';
import { resolveAppLocalTypeScriptCompilerPath } from './typescript';

import type {
  ResolvedRouteHandlerPreparation,
  RouteHandlersConfig
} from '../types';

const inFlightPreparationRuns = new Map<string, Promise<void>>();

const createPreparationRunKey = ({
  rootDir,
  preparations
}: {
  rootDir: string;
  preparations: Array<ResolvedRouteHandlerPreparation>;
}): string => {
  // The process-local dedupe key intentionally uses the fully resolved
  // preparation payload. Two callers should share work only when they would run
  // the exact same task set from the same app root.
  return JSON.stringify({
    rootDir,
    preparations
  });
};

const runChildProcess = ({
  label,
  command,
  args,
  cwd
}: {
  label: string;
  command: string;
  args: Array<string>;
  cwd: string;
}): Promise<void> =>
  new Promise((resolve, reject) => {
    // Preparation tasks run as real child processes because they represent
    // app-owned side effects such as TypeScript project builds. Capturing both
    // stdout and stderr lets us surface a useful runtime error if one fails.
    const childProcess = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';

    childProcess.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    childProcess.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    childProcess.on('error', error => {
      reject(
        createRuntimeError(`Failed to start ${label}.`, {
          cause:
            error instanceof Error ? error.message : 'unknown child-process error'
        })
      );
    });

    childProcess.on('close', exitCode => {
      if (exitCode === 0) {
        // A successful preparation task is intentionally silent; callers only
        // care that required app artifacts are ready for the next cache or
        // routing phase.
        resolve();
        return;
      }

      reject(
        createRuntimeError(`${label} failed with exit code ${exitCode ?? -1}.`, {
          stdout: stdout.trim() || undefined,
          stderr: stderr.trim() || undefined
        })
      );
    });
  });

/**
 * Execute a single resolved preparation task.
 *
 * Dispatches to the appropriate runner based on the preparation kind:
 * - `command`: spawns the configured command in the resolved cwd.
 * - `tsc-project`: runs the app-local TypeScript compiler against the
 *   configured tsconfig.
 *
 * @param rootDir - Application root directory.
 * @param preparation - Resolved preparation task to execute.
 */
const runResolvedPreparationTask = async ({
  rootDir,
  preparation
}: {
  rootDir: string;
  preparation: ResolvedRouteHandlerPreparation;
}): Promise<void> => {
  if (preparation.kind === 'command') {
    // Generic command preparations remain app-defined black boxes. We resolve
    // the command array earlier in config processing; by the time execution
    // reaches this branch, the runtime only needs to spawn it faithfully.
    const [command, ...args] = preparation.command;

    await runChildProcess({
      label: `prepare task "${preparation.id}"`,
      command,
      args,
      cwd: preparation.cwd
    });
    return;
  }

  // `tsc-project` preparations are the cache-aware path we understand deeply.
  // We resolve the app-local compiler entry and invoke it directly so the
  // runtime does not depend on shell resolution or a globally installed `tsc`.
  const tscEntryPath = resolveAppLocalTypeScriptCompilerPath({ rootDir });
  await runChildProcess({
    label: `prepare task "${preparation.id}"`,
    command: process.execPath,
    args: [tscEntryPath, '-p', preparation.tsconfigPath, '--pretty', 'false'],
    cwd: rootDir
  });
};

export const runResolvedRouteHandlerPreparations = async ({
  rootDir,
  preparations
}: {
  rootDir: string;
  preparations: Array<ResolvedRouteHandlerPreparation>;
}): Promise<void> => {
  if (preparations.length === 0) {
    // No configured preparation means downstream cache and generation logic can
    // proceed immediately. Returning early keeps the "no prepare work" case
    // extremely cheap.
    return;
  }

  const runKey = createPreparationRunKey({
    rootDir,
    preparations
  });
  const existingRun = inFlightPreparationRuns.get(runKey);
  if (existingRun != null) {
    // This is the process-local dedupe layer for preparation work. It is
    // separate from the on-disk preparation cache and only prevents duplicate
    // concurrent execution inside one process lifetime.
    return existingRun;
  }

  const runPromise = (async () => {
    for (const preparation of preparations) {
      // Consumer hand-off into the preparation-cache decision layer. The cache
      // answers whether this concrete resolved preparation is unchanged and may
      // be skipped, or whether execution must happen before the runtime can
      // continue.
      const executionState = await getResolvedPreparationExecutionState({
        rootDir,
        preparation
      });
      if (!executionState.shouldRun) {
        // This is the main cached fast path for prepare work. The task's inputs
        // are unchanged, so we deliberately avoid respawning the underlying
        // command or TypeScript compiler.
        continue;
      }

      await runResolvedPreparationTask({
        rootDir,
        preparation
      });
      // Completion is recorded only after the task exits successfully so the
      // next run never treats a failed or interrupted preparation as reusable.
      await executionState.markCompleted();
    }
  })().finally(() => {
    inFlightPreparationRuns.delete(runKey);
  });

  inFlightPreparationRuns.set(runKey, runPromise);
  return runPromise;
};

export const prepareRouteHandlersFromConfig = async ({
  rootDir,
  routeHandlersConfig
}: {
  rootDir: string;
  routeHandlersConfig: RouteHandlersConfig | undefined;
}): Promise<void> => {
  // Consumer-facing entry into the preparation group. Callers pass the app
  // config boundary here; from this point onward the system resolves concrete
  // preparation tasks, consults the preparation cache, and executes only the
  // work that still needs to happen.
  //
  // Keeping this wrapper separate from raw execution is useful because most
  // consumers think in terms of "prepare the app for route handlers," not in
  // terms of individual resolved preparation task records.

  await runResolvedRouteHandlerPreparations({
    rootDir,
    preparations: resolveRouteHandlerPreparations({
      rootDir,
      routeHandlersConfig
    })
  });
};
