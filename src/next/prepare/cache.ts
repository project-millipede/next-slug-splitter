/**
 * Preparation-cache decision layer for app-owned prepare tasks.
 *
 * @remarks
 * This module belongs to the "preparation cache" group. It does not execute
 * preparation tasks itself; instead it answers the question "does this
 * resolved preparation still need to run?"
 *
 * The current implementation deliberately draws a strong line between task
 * kinds:
 * - `tsc-project` tasks participate in on-disk caching because we can derive a
 *   meaningful input graph from the project directory and compiler path
 * - generic `command` tasks always run because the library cannot reliably
 *   infer their full dependency graph yet
 *
 * Consumers do not normally call this module directly. They enter through
 * `prepareRouteHandlersFromConfig(...)`, which then hands each resolved task to
 * this decision layer before any subprocess is launched.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hashSync, HashAlgorithm } from '@cacheable/utils';
import fileEntryCache, { type FileEntryCache } from 'file-entry-cache';
import globFiles from 'fast-glob';

import { isArray, isString } from '../../utils/type-guards';
import {
  isObjectRecord,
  readObjectProperty
} from '../../utils/type-guards-custom';
import { toCanonicalJson } from '../../utils/json-serializer';
import { tryResolveAppLocalTypeScriptCompilerPath } from './typescript';

import type { ResolvedRouteHandlerPreparation } from '../types';

const PREPARATION_CACHE_DIRECTORY = path.join(
  '.next',
  'cache',
  'route-handlers-preparations'
);
const PREPARATION_CACHE_SNAPSHOT_VERSION = 1;

type PreparationCacheSnapshot = {
  version: number;
  identity: string;
  inputFilePaths: Array<string>;
  updatedAt: string;
};

type PreparationExecutionState = {
  shouldRun: boolean;
  markCompleted: () => Promise<void>;
};

const createPreparationIdentity = (
  preparation: ResolvedRouteHandlerPreparation
): string =>
  hashSync(
    toCanonicalJson(preparation),
    {
      algorithm: HashAlgorithm.DJB2,
      serialize: value => JSON.stringify(toCanonicalJson(value))
    }
  );

const resolvePreparationCacheDirectory = (rootDir: string): string =>
  path.resolve(rootDir, PREPARATION_CACHE_DIRECTORY);

const createPreparationCacheFileName = ({
  preparationIdentity
}: {
  preparationIdentity: string;
}): string => `${preparationIdentity}.json`;

const resolvePreparationSnapshotPath = ({
  rootDir,
  preparationIdentity
}: {
  rootDir: string;
  preparationIdentity: string;
}): string =>
  path.join(
    resolvePreparationCacheDirectory(rootDir),
    createPreparationCacheFileName({
      preparationIdentity
    })
  );

const createPreparationFileCache = ({
  rootDir,
  preparationIdentity
}: {
  rootDir: string;
  preparationIdentity: string;
}): FileEntryCache =>
  fileEntryCache.create(
    `prepare-${preparationIdentity}`,
    resolvePreparationCacheDirectory(rootDir),
    {
      cwd: rootDir,
      restrictAccessToCwd: false,
      useAbsolutePathAsKey: true,
      useCheckSum: true,
      useModifiedTime: true,
      hashAlgorithm: 'sha256'
    }
  );

const isPreparationCacheSnapshot = (
  value: unknown
): value is PreparationCacheSnapshot => {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    readObjectProperty(value, 'version') === PREPARATION_CACHE_SNAPSHOT_VERSION &&
    isString(readObjectProperty(value, 'identity')) &&
    isArray(readObjectProperty(value, 'inputFilePaths')) &&
    (readObjectProperty(value, 'inputFilePaths') as Array<unknown>).every(
      isString
    ) &&
    isString(readObjectProperty(value, 'updatedAt'))
  );
};

const readPreparationCacheSnapshot = async (
  snapshotPath: string
): Promise<PreparationCacheSnapshot | null> => {
  try {
    const raw = await readFile(snapshotPath, 'utf8');
    const parsed = JSON.parse(raw);
    return isPreparationCacheSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writePreparationCacheSnapshot = async ({
  snapshotPath,
  snapshot
}: {
  snapshotPath: string;
  snapshot: PreparationCacheSnapshot;
}): Promise<void> => {
  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
};

const clearPreparationFileCache = (cache: FileEntryCache): void => {
  for (const descriptor of cache.normalizeEntries()) {
    cache.removeEntry(descriptor.key);
  }
};

const uniqueSortedPaths = (filePaths: Array<string>): Array<string> =>
  [...new Set(filePaths)].sort((left, right) => left.localeCompare(right));

const maybePush = async (values: Array<string>, candidatePath: string) => {
  try {
    await readFile(candidatePath, 'utf8');
    values.push(candidatePath);
  } catch {
    return;
  }
};

const collectTscProjectInputFilePaths = async ({
  rootDir,
  tsconfigPath
}: {
  rootDir: string;
  tsconfigPath: string;
}): Promise<Array<string>> => {
  // This helper defines the observable input surface for the cached
  // `tsc-project` preparation group. If any file in this collected set changes,
  // the preparation is considered stale and must execute again.
  const projectRoot = path.dirname(tsconfigPath);
  const projectFiles = await globFiles(
    ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,json}'],
    {
      cwd: projectRoot,
      absolute: true,
      onlyFiles: true,
      dot: true,
      ignore: [
        '**/node_modules/**',
        '**/.next/**',
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
        '**/*.tsbuildinfo'
      ]
    }
  );

  const inputFilePaths = [...projectFiles, tsconfigPath];
  await maybePush(inputFilePaths, path.join(projectRoot, 'package.json'));

  const rootPackageJsonPath = path.join(rootDir, 'package.json');
  if (rootPackageJsonPath !== path.join(projectRoot, 'package.json')) {
    await maybePush(inputFilePaths, rootPackageJsonPath);
  }

  const compilerPath = tryResolveAppLocalTypeScriptCompilerPath({
    rootDir
  });
  if (compilerPath != null) {
    inputFilePaths.push(compilerPath);
  }

  return uniqueSortedPaths(inputFilePaths);
};

const createPreparationExecutionState = async ({
  rootDir,
  preparation
}: {
  rootDir: string;
  preparation: ResolvedRouteHandlerPreparation;
}): Promise<PreparationExecutionState> => {
  if (preparation.kind === 'command') {
    // Generic commands currently belong to the "always execute" branch of the
    // preparation group. We do not pretend to cache them until we have an
    // explicit way to model their real inputs.
    return {
      shouldRun: true,
      markCompleted: async () => {}
    };
  }

  const preparationIdentity = createPreparationIdentity(preparation);
  const snapshotPath = resolvePreparationSnapshotPath({
    rootDir,
    preparationIdentity
  });
  const fileCache = createPreparationFileCache({
    rootDir,
    preparationIdentity
  });
  const currentInputFilePaths = await collectTscProjectInputFilePaths({
    rootDir,
    tsconfigPath: preparation.tsconfigPath
  });
  const existingSnapshot = await readPreparationCacheSnapshot(snapshotPath);
  const hasMatchingIdentity =
    existingSnapshot?.identity === preparationIdentity;
  const existingInputFilePaths = new Set(existingSnapshot?.inputFilePaths ?? []);
  const currentInputFilePathSet = new Set(currentInputFilePaths);
  const removedInputFilePaths = hasMatchingIdentity
    ? [...existingInputFilePaths].filter(
        filePath => !currentInputFilePathSet.has(filePath)
      )
    : [];

  if (!hasMatchingIdentity) {
    clearPreparationFileCache(fileCache);
  }

  for (const removedInputFilePath of removedInputFilePaths) {
    fileCache.removeEntry(removedInputFilePath);
  }

  const analyzedInputs = fileCache.analyzeFiles(currentInputFilePaths);
  const hasChangedInputs =
    removedInputFilePaths.length > 0 ||
    analyzedInputs.changedFiles.length > 0 ||
    analyzedInputs.notFoundFiles.length > 0;

  if (!hasChangedInputs && hasMatchingIdentity) {
    // This is the successful cache-hit path for the preparation group. The
    // resolved task identity still matches and every tracked input file is
    // unchanged, so the caller may skip the actual subprocess execution.
    return {
      shouldRun: false,
      markCompleted: async () => {}
    };
  }

  return {
    shouldRun: true,
    markCompleted: async () => {
      fileCache.reconcile();
      await writePreparationCacheSnapshot({
        snapshotPath,
        snapshot: {
          version: PREPARATION_CACHE_SNAPSHOT_VERSION,
          identity: preparationIdentity,
          inputFilePaths: currentInputFilePaths,
          updatedAt: new Date().toISOString()
        }
      });
    }
  };
};

/**
 * Decide whether a resolved preparation task needs to run and persist cache
 * state after successful execution.
 *
 * Command preparations always run because generic commands do not expose a
 * reliable input graph. TypeScript-project preparations may be skipped when
 * their project-local inputs are unchanged.
 *
 * Consumer note:
 * callers reach this function indirectly from `prepare.ts`. That means a
 * runtime consumer does not need to know how preparation caching works; it
 * simply asks the preparation subsystem to run, and this layer decides whether
 * the work is already satisfied.
 *
 * @param input - Preparation execution input.
 * @returns Execution state for the preparation.
 */
export const getResolvedPreparationExecutionState = async ({
  rootDir,
  preparation
}: {
  rootDir: string;
  preparation: ResolvedRouteHandlerPreparation;
}): Promise<PreparationExecutionState> => {
  try {
    return await createPreparationExecutionState({
      rootDir,
      preparation
    });
  } catch {
    return {
      shouldRun: true,
      markCompleted: async () => {}
    };
  }
};
