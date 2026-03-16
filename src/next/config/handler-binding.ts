import {
  createRuntimeTraitVariantResolver,
  type HandlerFactoryVariantResolver,
  type RuntimeTraitVariantRule
} from '../../core/runtime-variants';
import {
  appendModuleReferenceSubpath,
  getModuleReferenceValue,
  isModuleReference,
  normalizeModuleReferenceFromRoot,
  resolveModuleReferenceToPath
} from '../../module-reference';
import { isArrayOf, isFunction } from '../../utils/type-guards';

import { createConfigError } from '../../utils/errors';
import { isNonEmptyArray } from '../../utils/type-guards-extended';
import {
  isNonEmptyString,
  isObjectRecord,
  isStringArray,
  readObjectProperty
} from './shared';

import type {
  CustomHandlerFactoryVariantStrategy,
  HandlerFactoryVariantStrategy,
  ResolvedModuleReference,
  RouteHandlerBinding,
  RuntimeTraitHandlerFactoryVariantStrategy
} from '../types';

/**
 * Resolved binding data for a route handler target.
 */
export type ResolvedRouteHandlerBinding = {
  /**
   * Resolved import path for components used in MDX content.
   */
  componentsImport: ResolvedModuleReference;
  /**
   * Optional resolved page-config import used during planning and capture.
   */
  pageConfigImport?: ResolvedModuleReference;
  /**
   * Resolver function for selecting the factory variant.
   */
  resolveHandlerFactoryVariant: HandlerFactoryVariantResolver;
  /**
   * Normalized runtime handler factory import base.
   */
  runtimeHandlerFactoryImportBase: ResolvedModuleReference;
};

/**
 * Determine whether a value is a runtime-trait rule descriptor.
 *
 * @param value - Candidate rule value.
 * @returns `true` when the value matches the supported rule shape.
 */
const isRuntimeTraitVariantRule = (
  value: unknown
): value is RuntimeTraitVariantRule =>
  isObjectRecord(value) &&
  isNonEmptyString(readObjectProperty(value, 'trait')) &&
  isNonEmptyString(readObjectProperty(value, 'variant'));

/**
 * Read and validate one runtime-traits variant strategy.
 *
 * @param value - Candidate strategy value.
 * @returns Validated runtime-traits strategy.
 * @throws If the value does not match the expected strategy shape.
 */
const readRuntimeTraitVariantStrategy = (
  value: unknown
): RuntimeTraitHandlerFactoryVariantStrategy => {
  if (!isObjectRecord(value) || readObjectProperty(value, 'kind') !== 'runtime-traits') {
    throw createConfigError(
      'handlerBinding.runtimeFactory.variantStrategy must be an object with kind "runtime-traits" or "custom".'
    );
  }

  const defaultVariant = readObjectProperty(value, 'defaultVariant');
  if (!isNonEmptyString(defaultVariant)) {
    throw createConfigError(
      'handlerBinding.runtimeFactory.variantStrategy.defaultVariant must be a non-empty string.'
    );
  }

  const rules = readObjectProperty(value, 'rules');
  if (!isArrayOf(isRuntimeTraitVariantRule)(rules)) {
    throw createConfigError(
      'handlerBinding.runtimeFactory.variantStrategy.rules must be an array of { trait, variant } objects.'
    );
  }

  return {
    kind: 'runtime-traits',
    defaultVariant,
    rules
  };
};

/**
 * Read and validate one custom variant strategy.
 *
 * @param value - Candidate strategy value.
 * @returns Validated custom strategy.
 * @throws If the value does not match the expected strategy shape.
 */
const readCustomVariantStrategy = (
  value: unknown
): CustomHandlerFactoryVariantStrategy => {
  if (!isObjectRecord(value) || readObjectProperty(value, 'kind') !== 'custom') {
    throw createConfigError(
      'handlerBinding.runtimeFactory.variantStrategy must be an object with kind "runtime-traits" or "custom".'
    );
  }

  const resolveVariant = readObjectProperty(value, 'resolveVariant');
  if (!isFunction(resolveVariant)) {
    throw createConfigError(
      'handlerBinding.runtimeFactory.variantStrategy.resolveVariant must be a function.'
    );
  }

  const variants = readObjectProperty(value, 'variants');
  if (
    !isStringArray(variants) ||
    !isNonEmptyArray(variants) ||
    variants.some(variant => !isNonEmptyString(variant))
  ) {
    throw createConfigError(
      'handlerBinding.runtimeFactory.variantStrategy.variants must be a non-empty string array.'
    );
  }

  return {
    kind: 'custom',
    resolveVariant: resolveVariant as HandlerFactoryVariantResolver,
    variants
  };
};

/**
 * Read and validate one variant strategy.
 *
 * @param value - Candidate strategy value.
 * @returns Validated variant strategy.
 */
const readHandlerFactoryVariantStrategy = (
  value: unknown
): HandlerFactoryVariantStrategy => {
  if (
    isObjectRecord(value) &&
    readObjectProperty(value, 'kind') === 'runtime-traits'
  ) {
    return readRuntimeTraitVariantStrategy(value);
  }

  return readCustomVariantStrategy(value);
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
  if (readObjectProperty(value, 'registryImport') !== undefined) {
    throw createConfigError(
      'handlerBinding.registryImport has been replaced by handlerBinding.pageConfigImport.'
    );
  }
  const pageConfigImport = readObjectProperty(value, 'pageConfigImport');
  if (pageConfigImport !== undefined && !isModuleReference(pageConfigImport)) {
    throw createConfigError(
      'handlerBinding.pageConfigImport must be a module reference object when provided.'
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
    pageConfigImport:
      pageConfigImport !== undefined ? pageConfigImport : undefined,
    runtimeFactory: {
      importBase,
      variantStrategy: readHandlerFactoryVariantStrategy(
        readObjectProperty(runtimeFactory, 'variantStrategy')
      )
    }
  };
};

/**
 * Build the list of known variant subpaths that one strategy may emit.
 *
 * @param strategy - Validated variant strategy.
 * @returns Deduplicated list of variant names.
 */
const getKnownVariantNames = (
  strategy: HandlerFactoryVariantStrategy
): Array<string> => {
  if (strategy.kind === 'custom') {
    return [...new Set(strategy.variants)];
  }

  return [
    ...new Set([
      strategy.defaultVariant,
      ...strategy.rules.map(rule => rule.variant)
    ])
  ];
};

/**
 * Create the runtime resolver for one validated strategy.
 *
 * @param strategy - Validated variant strategy.
 * @returns Resolver function used during handler emission.
 */
const createVariantResolver = (
  strategy: HandlerFactoryVariantStrategy
): HandlerFactoryVariantResolver => {
  if (strategy.kind === 'custom') {
    return strategy.resolveVariant;
  }

  return createRuntimeTraitVariantResolver({
    defaultVariant: strategy.defaultVariant,
    rules: strategy.rules
  });
};

/**
 * Assert that one module reference can be resolved from the application root.
 *
 * @param input - Resolution assertion input.
 * @returns Nothing. Throws when resolution fails.
 */
const assertResolvableModuleReference = ({
  rootDir,
  reference,
  errorMessage
}: {
  rootDir: string;
  reference: ResolvedModuleReference;
  errorMessage: string;
}): void => {
  try {
    resolveModuleReferenceToPath({
      rootDir,
      reference
    });
  } catch {
    throw createConfigError(errorMessage);
  }
};

/**
 * Validate that the runtime factory import base and every declared variant
 * import are resolvable from the application root.
 *
 * @param input - Validation input.
 * @returns Nothing. Throws when validation fails.
 */
const assertResolvableHandlerFactoryBindingImports = ({
  rootDir,
  runtimeHandlerFactoryImportBase,
  knownVariants
}: {
  rootDir: string;
  runtimeHandlerFactoryImportBase: ResolvedModuleReference;
  knownVariants: Array<string>;
}): void => {
  const importBaseLabel = getModuleReferenceValue(runtimeHandlerFactoryImportBase);

  assertResolvableModuleReference({
    rootDir,
    reference: runtimeHandlerFactoryImportBase,
    errorMessage: `handlerBinding.runtimeFactory.importBase "${importBaseLabel}" could not be resolved from "${rootDir}".`
  });

  for (const variant of knownVariants) {
    const variantImportReference = appendModuleReferenceSubpath(
      runtimeHandlerFactoryImportBase,
      variant
    );
    const variantImport = getModuleReferenceValue(variantImportReference);

    assertResolvableModuleReference({
      rootDir,
      reference: variantImportReference,
      errorMessage: `handlerBinding.runtimeFactory.importBase "${importBaseLabel}" is missing resolvable variant import "${variantImport}" from "${rootDir}".`
    });
  }
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
  const pageConfigImport =
    binding.pageConfigImport == null
      ? undefined
      : normalizeModuleReferenceFromRoot({
          rootDir,
          reference: binding.pageConfigImport
        });
  const runtimeHandlerFactoryImportBase = normalizeModuleReferenceFromRoot({
    rootDir,
    reference: binding.runtimeFactory.importBase
  });
  const strategy = binding.runtimeFactory.variantStrategy;

  assertResolvableHandlerFactoryBindingImports({
    rootDir,
    runtimeHandlerFactoryImportBase,
    knownVariants: getKnownVariantNames(strategy)
  });

  if (pageConfigImport != null) {
    assertResolvableModuleReference({
      rootDir,
      reference: pageConfigImport,
      errorMessage: `handlerBinding.pageConfigImport "${getModuleReferenceValue(
        pageConfigImport
      )}" could not be resolved from "${rootDir}".`
    });
  }

  return {
    componentsImport,
    pageConfigImport,
    resolveHandlerFactoryVariant: createVariantResolver(strategy),
    runtimeHandlerFactoryImportBase
  };
};
