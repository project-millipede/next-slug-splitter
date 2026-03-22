import {
  getModuleReferenceValue,
  isModuleReference,
  normalizeModuleReferenceFromRoot,
  resolveModuleReferenceToPath
} from '../../module-reference';

import { createConfigError } from '../../utils/errors';
import { isObjectRecord, readObjectProperty } from './shared';

import type {
  ResolvedModuleReference,
  ResolvedRouteHandlerProcessorConfig,
  RouteHandlerBinding
} from '../types';

/**
 * Resolved binding data for a route handler target.
 */
export type ResolvedRouteHandlerBinding = {
  /**
   * Module reference used as the default import source for components
   * in generated handler files.
   *
   * The specifier (or path) is written verbatim into the generated
   * `import` statement — no resolution or evaluation happens at
   * config time. For example, `packageModule('@content/mdx')` produces
   * `import { Counter } from '@content/mdx';` in the generated handler.
   *
   * This serves as the **default** source. The processor's `egress` may
   * override the import source per component by returning an explicit
   * `source` in each component entry — in that case the default is
   * bypassed for those components.
   *
   * A barrel re-exporting all components works here because the code
   * generator emits only the specific named imports each handler needs,
   * allowing the bundler to tree-shake the rest.
   */
  componentsImport: ResolvedModuleReference;

  /**
   * Resolved processor configuration used during planning.
   */
  processorConfig: ResolvedRouteHandlerProcessorConfig;

  /**
   * Normalized runtime handler factory import base.
   */
  runtimeHandlerFactoryImportBase: ResolvedModuleReference;
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

  const componentsImport = readObjectProperty(value, 'componentsImport');
  if (!isModuleReference(componentsImport)) {
    throw createConfigError(
      'handlerBinding.componentsImport must be a module reference object.'
    );
  }

  const processorImport = readObjectProperty(value, 'processorImport');
  if (!isModuleReference(processorImport)) {
    throw createConfigError(
      'handlerBinding.processorImport must be a module reference object.'
    );
  }

  const runtimeFactory = readObjectProperty(value, 'runtimeFactory');
  if (!isObjectRecord(runtimeFactory)) {
    throw createConfigError('handlerBinding.runtimeFactory must be an object.');
  }

  const importBase = readObjectProperty(runtimeFactory, 'importBase');
  if (!isModuleReference(importBase)) {
    throw createConfigError(
      'handlerBinding.runtimeFactory.importBase must be a module reference object.'
    );
  }

  return {
    componentsImport,
    processorImport,
    runtimeFactory: {
      importBase
    }
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
  const componentsImport = normalizeModuleReferenceFromRoot({
    rootDir,
    reference: binding.componentsImport
  });
  const processorImport = normalizeModuleReferenceFromRoot({
    rootDir,
    reference: binding.processorImport
  });
  const runtimeHandlerFactoryImportBase = normalizeModuleReferenceFromRoot({
    rootDir,
    reference: binding.runtimeFactory.importBase
  });

  try {
    resolveModuleReferenceToPath({ rootDir, reference: processorImport });
  } catch {
    throw createConfigError(
      `handlerBinding.processorImport "${getModuleReferenceValue(processorImport)}" could not be resolved from "${rootDir}".`
    );
  }

  try {
    resolveModuleReferenceToPath({
      rootDir,
      reference: runtimeHandlerFactoryImportBase
    });
  } catch {
    throw createConfigError(
      `handlerBinding.runtimeFactory.importBase "${getModuleReferenceValue(runtimeHandlerFactoryImportBase)}" could not be resolved from "${rootDir}".`
    );
  }

  return {
    componentsImport,
    processorConfig: {
      kind: 'module',
      processorImport
    },
    runtimeHandlerFactoryImportBase
  };
};
