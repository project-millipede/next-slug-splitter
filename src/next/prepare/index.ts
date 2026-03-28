/**
 * App-owned preparation execution for the Next integration.
 *
 * @remarks
 * This file is the operational entrypoint for `routeHandlersConfig.app.prepare`.
 * It resolves the configured prepare steps, invokes the app-local TypeScript
 * compiler for each one, and shares one in-flight promise when identical
 * preparation requests overlap in the same process.
 *
 * There are two distinct concerns here:
 * - execution semantics: invoke the app-local TypeScript compiler correctly
 * - in-process deduplication: if multiple callers ask for the same resolved
 *   preparation in one process, they share the same active execution
 *
 * Consumer-facing runtime code reaches this file from multiple places:
 * - adapter rewrite generation
 * - runtime config loading
 * - lookup fallback preparation
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

import { createRuntimeError } from '../../utils/errors';
import { resolveRouteHandlerPreparations } from '../config/app';
import { resolveAppLocalTypeScriptCompilerPath } from './typescript';

import type {
  ResolvedRouteHandlerPreparation,
  RouteHandlersConfig
} from '../types';

// Cache-policy note: prepare keeps only in-flight dedupe. It does not remember
// settled successful runs. See `docs/architecture/cache-policy.md`.
const inFlightPreparationRuns = new Map<string, Promise<void>>();

const createPreparationRunKey = (
  rootDir: string,
  preparations: Array<ResolvedRouteHandlerPreparation>
): string => {
  // Two callers should share work only when they would run the exact same
  // prepare-step set from the same app root.
  return JSON.stringify({
    rootDir,
    preparations
  });
};

const runChildProcess = (
  label: string,
  command: string,
  args: Array<string>,
  cwd: string
): Promise<void> =>
  new Promise((resolve, reject) => {
    // The prepare step runs as a real child process because it represents an
    // app-owned TypeScript project build. Capturing both stdout and stderr lets
    // us surface a useful runtime error if it fails.
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
        // A successful prepare step is intentionally silent; callers only
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
 * Execute one resolved prepare step.
 *
 * @param rootDir - Application root directory.
 * @param preparation - Resolved preparation to execute.
 * @param index - Stable step index used for error labeling.
 * @returns A promise that settles after the prepare step finishes.
 */
const runResolvedPreparationTask = async (
  rootDir: string,
  preparation: ResolvedRouteHandlerPreparation,
  index: number
): Promise<void> => {
  // We resolve the app-local compiler entry and invoke it directly so the
  // runtime does not depend on shell resolution or a globally installed `tsc`.
  const tscEntryPath = resolveAppLocalTypeScriptCompilerPath(rootDir);
  await runChildProcess(
    `routeHandlersConfig.app.prepare[${index}]`,
    process.execPath,
    [tscEntryPath, '-p', preparation.tsconfigPath, '--pretty', 'false'],
    rootDir
  );
};

export const runResolvedRouteHandlerPreparations = async (
  rootDir: string,
  preparations: Array<ResolvedRouteHandlerPreparation>
): Promise<void> => {
  if (preparations.length === 0) {
    // No configured preparation means downstream config loading and route
    // handling can proceed immediately.
    return;
  }

  const runKey = createPreparationRunKey(rootDir, preparations);
  const existingRun = inFlightPreparationRuns.get(runKey);
  if (existingRun != null) {
    // Share one active prepare run when identical callers overlap in the same
    // process. This avoids duplicate child processes without remembering prior
    // executions after they complete.
    return existingRun;
  }

  const runPromise = (async () => {
    for (const [index, preparation] of preparations.entries()) {
      // Prepare steps remain app-owned preprocessing. When configured, they
      // execute in declared order each time this entrypoint runs.
      await runResolvedPreparationTask(rootDir, preparation, index);
    }
  })().finally(() => {
    inFlightPreparationRuns.delete(runKey);
  });

  inFlightPreparationRuns.set(runKey, runPromise);
  return runPromise;
};

export const prepareRouteHandlersFromConfig = async (
  rootDir: string,
  routeHandlersConfig: RouteHandlersConfig | undefined
): Promise<void> => {
  // Consumer-facing entry into app-owned preparation. Callers pass the app
  // config boundary here; from this point onward the system resolves the
  // concrete prepare steps and executes them before later routing work.
  //
  // Keeping this wrapper separate from raw execution is useful because most
  // consumers think in terms of "prepare the app for route handlers," not in
  // terms of the resolved preparation records.

  await runResolvedRouteHandlerPreparations(
    rootDir,
    resolveRouteHandlerPreparations({
      rootDir,
      routeHandlersConfig
    })
  );
};
