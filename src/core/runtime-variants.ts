import type { RegistryEntry } from './types';

/**
 * Function that selects the handler factory variant based on registry entries.
 */
export type HandlerFactoryVariantResolver = (
  entries: Array<RegistryEntry>
) => string;

/**
 * Single rule mapping a runtime trait to a factory variant.
 */
export type RuntimeTraitVariantRule = {
  /**
   * Runtime trait to check for.
   */
  trait: string;
  /**
   * Variant to use when the trait is present.
   */
  variant: string;
};

/**
 * Descriptor for creating a runtime-trait-based variant resolver.
 */
export type HandlerFactoryVariantDescriptor = {
  /**
   * Fallback variant when no rules match.
   */
  defaultVariant: string;
  /**
   * Ordered trait-to-variant mapping rules.
   */
  rules: Array<RuntimeTraitVariantRule>;
};

/**
 * Identity for a runtime-trait resolver.
 */
type RuntimeTraitVariantResolverIdentity = {
  /**
   * Discriminator for runtime-trait identity.
   */
  kind: 'runtime-traits';
  /**
   * Fallback variant from the descriptor.
   */
  defaultVariant: string;
  /**
   * Rules from the descriptor.
   */
  rules: Array<RuntimeTraitVariantRule>;
};

/**
 * Identity for a custom function-based resolver.
 */
type FunctionSourceVariantResolverIdentity = {
  /**
   * Discriminator for function-source identity.
   */
  kind: 'function-source';
  /**
   * String representation of the resolver function.
   */
  sourceText: string;
};

/**
 * Structured identity for a handler factory variant resolver.
 *
 * Variants:
 * - {@link RuntimeTraitVariantResolverIdentity}: Declarative trait-based resolver.
 * - {@link FunctionSourceVariantResolverIdentity}: Custom function-based resolver.
 */
export type HandlerFactoryVariantResolverIdentity =
  | RuntimeTraitVariantResolverIdentity
  | FunctionSourceVariantResolverIdentity;

const HANDLER_FACTORY_VARIANT_RESOLVER_IDENTITY = Symbol.for(
  'next-slug-splitter/handlerFactoryVariantResolverIdentity'
);

/**
 * Resolver function with optional attached identity metadata.
 */
type HandlerFactoryVariantResolverWithIdentity =
  HandlerFactoryVariantResolver & {
    /**
     * Optional structured identity for cache/comparison.
     */
    [HANDLER_FACTORY_VARIANT_RESOLVER_IDENTITY]?: HandlerFactoryVariantResolverIdentity;
  };

/**
 * Read the structured identity for one handler factory variant resolver.
 *
 * @param resolveVariant - Resolver whose identity should be exposed.
 * @returns Structured resolver identity suitable for cache hashing or direct
 * equality checks.
 */
export const getHandlerFactoryVariantResolverIdentity = (
  resolveVariant: HandlerFactoryVariantResolver
): HandlerFactoryVariantResolverIdentity => {
  const identity = (
    resolveVariant as HandlerFactoryVariantResolverWithIdentity
  )[HANDLER_FACTORY_VARIANT_RESOLVER_IDENTITY];

  if (identity) {
    return identity;
  }

  return {
    kind: 'function-source',
    sourceText: resolveVariant.toString()
  };
};

/**
 * Compare two resolver identities structurally.
 *
 * @param left - Left resolver identity.
 * @param right - Right resolver identity.
 * @returns `true` when both identities describe the same resolver behavior
 * contract, otherwise `false`.
 */
export const isSameHandlerFactoryVariantResolverIdentity = (
  left: HandlerFactoryVariantResolverIdentity,
  right: HandlerFactoryVariantResolverIdentity
): boolean => {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === 'function-source' && right.kind === 'function-source') {
    return left.sourceText === right.sourceText;
  }

  if (
    left.kind === 'runtime-traits' &&
    right.kind === 'runtime-traits' &&
    left.defaultVariant === right.defaultVariant &&
    left.rules.length === right.rules.length
  ) {
    return left.rules.every(
      (rule, index) =>
        rule.trait === right.rules[index]?.trait &&
        rule.variant === right.rules[index]?.variant
    );
  }

  return false;
};

/**
 * Create a runtime-trait-based resolver from a declarative descriptor.
 *
 * @param descriptor - Resolver descriptor that maps runtime traits to factory
 * variants.
 * @returns Resolver function tagged with structured descriptor identity.
 */
export const createRuntimeTraitVariantResolver = ({
  defaultVariant,
  rules
}: HandlerFactoryVariantDescriptor): HandlerFactoryVariantResolver => {
  const resolveVariant = (entries: Array<RegistryEntry>): string => {
    const presentTraits = new Set<string>();

    for (const entry of entries) {
      for (const runtimeTrait of entry.runtimeTraits) {
        presentTraits.add(runtimeTrait);
      }
    }

    for (const rule of rules) {
      if (presentTraits.has(rule.trait)) {
        return rule.variant;
      }
    }

    return defaultVariant;
  };

  const identity: RuntimeTraitVariantResolverIdentity = {
    kind: 'runtime-traits',
    defaultVariant,
    rules
  };

  (resolveVariant as HandlerFactoryVariantResolverWithIdentity)[
    HANDLER_FACTORY_VARIANT_RESOLVER_IDENTITY
  ] = identity;

  return resolveVariant;
};
