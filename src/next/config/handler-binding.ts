import {
  isModuleReference,
  normalizeModuleReference,
  resolveModuleReferenceToPath
} from '../../module-reference';

import { createConfigError } from '../../utils/errors';
import { isObjectRecord, readObjectProperty } from './shared';

import type {
  ResolvedRouteHandlerProcessorConfig,
  RouteHandlerBinding
} from '../types';

/**
 * Resolved binding data for a route handler target.
 */
export type ResolvedRouteHandlerBinding = {
  /**
   * Resolved processor configuration used during planning.
   */
  processorConfig: ResolvedRouteHandlerProcessorConfig;
};

/**
 * Read and validate one handler binding.
 *
 * @param value - Candidate binding value.
 * @returns Validated binding.
 * @throws If the value does not match the expected binding shape.
 */
const readRouteHandlerBinding = (value: unknown): RouteHandlerBinding => {
  if (!isObjectRecord(value)) {
    throw createConfigError('handlerBinding must be an object.');
  }

  const processorImport = readObjectProperty(value, 'processorImport');
  if (!isModuleReference(processorImport)) {
    throw createConfigError(
      'handlerBinding.processorImport must be a module reference object.'
    );
  }

  return {
    processorImport
  };
};

/**
 * Resolve the binding contract for one configured target.
 *
 * @param input - Binding resolution input.
 * @returns Normalized runtime binding data used by the rest of the pipeline.
 */
export const resolveRouteHandlerBinding = ({
  rootDir,
  handlerBinding
}: {
  rootDir: string;
  handlerBinding: unknown;
}): ResolvedRouteHandlerBinding => {
  const binding = readRouteHandlerBinding(handlerBinding);

  const processorImport = normalizeModuleReference(
    rootDir,
    binding.processorImport
  );

  try {
    resolveModuleReferenceToPath(rootDir, processorImport);
  } catch {
    throw createConfigError(
      `handlerBinding.processorImport "${processorImport.kind === 'package' ? processorImport.specifier : processorImport.path}" could not be resolved from "${rootDir}".`
    );
  }

  return {
    processorConfig: {
      kind: 'module',
      processorImport
    }
  };
};
