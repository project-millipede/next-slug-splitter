import process from 'node:process';

import type { AppPageDataCompilerCompileInput } from './types';
import type { JsonValue } from '../../utils/type-guards-json';
import {
  createConfigMissingError,
  createLookupError
} from '../../utils/errors';
import { readAppRouteLookupSnapshot } from './lookup-persisted';
import { compileAppPageDataWithWorker } from './page-data-worker/host/client';

/**
 * Run one App page-data compiler through the library-owned isolated worker.
 *
 * @template TInput Serializable input payload sent to the compiler module.
 * @template TResult Serializable result payload returned by the compiler
 * module.
 * @param input Stable target identifier plus the compiler input payload.
 * @returns The compiler result returned by the isolated worker process.
 */
export const runAppPageDataCompiler = async <
  TInput extends JsonValue = JsonValue,
  TResult extends JsonValue = JsonValue
>({
  targetId,
  input
}: AppPageDataCompilerCompileInput<TInput>): Promise<TResult> => {
  // The persisted App lookup snapshot is the only page-time discovery source
  // for compiler modules. This keeps route contracts independent from config
  // reloading while still letting adapter/proxy bootstrap own target metadata.
  const snapshot = await readAppRouteLookupSnapshot(process.cwd());

  if (snapshot == null) {
    throw createConfigMissingError(
      'Missing App Router lookup snapshot. Page-time App metadata requires a bootstrap-generated `.next/cache/route-handlers-app-lookup.json` snapshot.',
      { targetId }
    );
  }

  const targetSnapshot = snapshot.targets.find(
    target => target.targetId === targetId
  );

  if (targetSnapshot == null) {
    throw createLookupError(`Unknown targetId "${targetId}".`, { targetId });
  }

  if (targetSnapshot.pageDataCompilerModulePath == null) {
    throw createLookupError(
      `App Router lookup snapshot for target "${targetId}" is missing a persisted page-data compiler module path. Rebuild the app so next-slug-splitter can refresh ".next/cache/route-handlers-app-lookup.json".`,
      { targetId }
    );
  }

  const compilerModulePath = targetSnapshot.pageDataCompilerModulePath;

  return await compileAppPageDataWithWorker<TInput, TResult>({
    rootDir: process.cwd(),
    targetId,
    compilerModulePath,
    input
  });
};
