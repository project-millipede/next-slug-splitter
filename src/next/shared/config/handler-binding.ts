import {
  isModuleReference,
  normalizeModuleReference,
  resolveModuleReferenceToPath,
  type ResolvedModuleReference
} from '../../../module-reference';

import { createConfigError } from '../../../utils/errors';
import { isObjectRecord, readObjectProperty } from './shared';

import type { RouteHandlerBinding } from '../types';

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
 * Resolve the processor import for one configured target binding.
 *
 * @param input Binding resolution input.
 * @param input.rootDir Application root used to resolve module references.
 * @param input.handlerBinding Raw configured binding value.
 * @returns Resolved processor import used to build processor config.
 */
export const resolveRouteHandlerProcessorImport = ({
  rootDir,
  handlerBinding
}: {
  rootDir: string;
  handlerBinding: unknown;
}): ResolvedModuleReference => {
  // Shared binding resolution intentionally stays processor-only. App-only
  // page-data compiler ownership is resolved in the App router path.
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

  return processorImport;
};
