import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { isFunction } from '../../../../utils/type-guards';
import { createWorkerRuntimeMachine } from '../../../shared/worker/runtime/machine';

import type { AppPageDataCompiler } from '../../types';
import type {
  AppPageDataCompiledResponse,
  AppPageDataWorkerRequest
} from '../types';

const compilerCache = new Map<string, AppPageDataCompiler>();

/**
 * Retained App page-data worker state.
 *
 * @remarks
 * The page-data worker keeps its meaningful reuse in the module-level compiler
 * cache. The shared runtime machine still requires one explicit extension
 * state, so this type intentionally stays `null`.
 */
export type AppPageDataWorkerExtensionState = null;

/**
 * Check whether a compiler module path is directly importable by Node without
 * an extra transpilation step.
 *
 * @param modulePath Absolute module path chosen for the worker request.
 * @returns `true` when the path has a native JavaScript extension.
 */
const isNativelyImportableModulePath = (modulePath: string): boolean => {
  const extension = path.extname(modulePath);

  return extension === '.js' || extension === '.mjs' || extension === '.cjs';
};

/**
 * Load and validate one app-owned page-data compiler module.
 *
 * @param compilerModulePath Absolute path to the compiler module.
 * @returns The validated compiler object exported by the module.
 */
const loadAppPageDataCompiler = async (
  compilerModulePath: string
): Promise<AppPageDataCompiler> => {
  const cachedCompiler = compilerCache.get(compilerModulePath);

  if (cachedCompiler != null) {
    // Module caching avoids repeated dynamic imports for hot paths such as
    // static generation across multiple pages under one target.
    return cachedCompiler;
  }

  if (!isNativelyImportableModulePath(compilerModulePath)) {
    throw new Error(
      `Page-data compiler module "${compilerModulePath}" must resolve to a native JavaScript module (.js, .mjs, or .cjs).`
    );
  }

  const compilerModule = (await import(
    pathToFileURL(compilerModulePath).href
  )) as Record<string, unknown>;
  const compilerCandidate = compilerModule.pageDataCompiler;

  if (
    compilerCandidate == null ||
    typeof compilerCandidate !== 'object' ||
    !isFunction((compilerCandidate as { compile?: unknown }).compile)
  ) {
    throw new Error(
      `Page-data compiler module "${compilerModulePath}" must export pageDataCompiler with a compile(...) function.`
    );
  }

  const compiler = compilerCandidate as AppPageDataCompiler;
  compilerCache.set(compilerModulePath, compiler);
  return compiler;
};

/**
 * Create the shared runtime machine for the App page-data worker.
 *
 * @returns Shared runtime machine for one App page-data worker process.
 */
export const createAppPageDataWorkerRuntimeMachine = () =>
  createWorkerRuntimeMachine<
    AppPageDataWorkerRequest,
    AppPageDataCompiledResponse,
    AppPageDataWorkerExtensionState
  >({
    workerLabel: 'App page-data worker',
    initialExtensionState: null,
    handlers: {
      'compile-page-data': async ({ action }) => {
        const compiler = await loadAppPageDataCompiler(
          action.payload.compilerModulePath
        );
        const result = await compiler.compile({
          targetId: action.payload.targetId,
          input: action.payload.input
        });

        return {
          response: {
            subject: 'page-data-compiled',
            payload: {
              result
            }
          }
        };
      }
    }
  });
