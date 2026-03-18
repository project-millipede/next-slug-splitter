import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

import { createRuntimeError } from '../utils/errors';
import { resolveRouteHandlerPreparations } from './config/app';

import type {
  ResolvedRouteHandlerPreparation,
  RouteHandlersConfig
} from './types';

const APP_ROOT_PREPARE_RESOLUTION_ANCHOR = '__app_root_prepare__';

const inFlightPreparationRuns = new Map<string, Promise<void>>();

const createPreparationRunKey = ({
  rootDir,
  preparations
}: {
  rootDir: string;
  preparations: Array<ResolvedRouteHandlerPreparation>;
}): string =>
  JSON.stringify({
    rootDir,
    preparations
  });

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
 * Resolve the app-local TypeScript compiler entry path (`tsc.js`).
 *
 * @param rootDir - Application root used as the resolution base.
 * @returns Absolute path to the TypeScript compiler entry.
 * @throws If `typescript` is not installed in the application.
 */
const resolveAppLocalTypeScriptCompilerPath = ({
  rootDir
}: {
  rootDir: string;
}): string => {
  const requireFromRoot = createRequire(
    path.resolve(rootDir, APP_ROOT_PREPARE_RESOLUTION_ANCHOR)
  );

  try {
    return requireFromRoot.resolve('typescript/lib/tsc.js');
  } catch {
    throw createRuntimeError(
      'Unable to resolve app-local TypeScript for routeHandlersConfig.app.prepare. Install "typescript" in the app or remove the "tsc-project" preparation task.',
      { rootDir }
    );
  }
};

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
    const [command, ...args] = preparation.command;

    await runChildProcess({
      label: `prepare task "${preparation.id}"`,
      command,
      args,
      cwd: preparation.cwd
    });
    return;
  }

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
    return;
  }

  const runKey = createPreparationRunKey({
    rootDir,
    preparations
  });
  const existingRun = inFlightPreparationRuns.get(runKey);
  if (existingRun != null) {
    return existingRun;
  }

  const runPromise = (async () => {
    for (const preparation of preparations) {
      await runResolvedPreparationTask({
        rootDir,
        preparation
      });
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
  await runResolvedRouteHandlerPreparations({
    rootDir,
    preparations: resolveRouteHandlerPreparations({
      rootDir,
      routeHandlersConfig
    })
  });
};
