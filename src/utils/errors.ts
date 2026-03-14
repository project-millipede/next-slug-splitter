/**
 * Shared package prefix used in user-facing logs and error messages.
 */
export const NEXT_SLUG_SPLITTER_PREFIX = '[next-slug-splitter]';

/**
 * Machine-readable error codes for package-originated failures.
 *
 * Variants:
 * - 'CACHE_INVALID': Cache validation or corruption error.
 * - 'CLI_INVALID': CLI input or usage error.
 * - 'CONFIG_INVALID': Configuration validation error.
 * - 'CONFIG_MISSING': Required configuration missing.
 * - 'GENERATOR_INVALID': Handler file generation error.
 * - 'LOOKUP_INVALID': Route lookup or resolution error.
 * - 'PIPELINE_INVALID': Pipeline execution error.
 * - 'REGISTRY_INVALID': Registry loading or validation error.
 * - 'RUNTIME_INVALID': Runtime orchestration error.
 */
export type NextSlugSplitterErrorCode =
  | 'CACHE_INVALID'
  | 'CLI_INVALID'
  | 'CONFIG_INVALID'
  | 'CONFIG_MISSING'
  | 'GENERATOR_INVALID'
  | 'LOOKUP_INVALID'
  | 'PIPELINE_INVALID'
  | 'REGISTRY_INVALID'
  | 'RUNTIME_INVALID';

/**
 * Structured context attached to package-originated errors.
 */
export type NextSlugSplitterErrorContext = Readonly<Record<string, unknown>>;

/**
 * Prefix a message with the package identifier.
 *
 * @param message - Message body without prefix.
 * @returns Prefixed message ready for display.
 */
export const formatNextSlugSplitterMessage = (message: string): string =>
  `${NEXT_SLUG_SPLITTER_PREFIX} ${message}`;

/**
 * Package-specific error class with structured codes and context.
 */
export class NextSlugSplitterError extends Error {
  /**
   * Machine-readable error category.
   */
  readonly code: NextSlugSplitterErrorCode;

  /**
   * Optional structured debugging context.
   */
  readonly context?: NextSlugSplitterErrorContext;

  /**
   * Create a package error.
   *
   * @param code - Machine-readable error code.
   * @param message - Human-readable message without prefix.
   * @param context - Optional debugging context.
   */
  constructor(
    code: NextSlugSplitterErrorCode,
    message: string,
    context?: NextSlugSplitterErrorContext
  ) {
    super(formatNextSlugSplitterMessage(message));
    this.name = 'NextSlugSplitterError';
    this.code = code;
    this.context = context;
  }
}

/**
 * Create a CLI input/usage error.
 *
 * @param message - Human-readable message.
 * @param context - Optional debugging context.
 * @returns CLI error instance.
 */
export const createCliError = (
  message: string,
  context?: NextSlugSplitterErrorContext
): NextSlugSplitterError =>
  new NextSlugSplitterError('CLI_INVALID', message, context);

/**
 * Create a configuration validation error.
 *
 * @param message - Human-readable message.
 * @param context - Optional debugging context.
 * @returns Config error instance.
 */
export const createConfigError = (
  message: string,
  context?: NextSlugSplitterErrorContext
): NextSlugSplitterError =>
  new NextSlugSplitterError('CONFIG_INVALID', message, context);

/**
 * Create a missing configuration error.
 *
 * @param message - Human-readable message.
 * @param context - Optional debugging context.
 * @returns Config missing error instance.
 */
export const createConfigMissingError = (
  message: string,
  context?: NextSlugSplitterErrorContext
): NextSlugSplitterError =>
  new NextSlugSplitterError('CONFIG_MISSING', message, context);

/**
 * Create a handler generation error.
 *
 * @param message - Human-readable message.
 * @param context - Optional debugging context.
 * @returns Generator error instance.
 */
export const createGeneratorError = (
  message: string,
  context?: NextSlugSplitterErrorContext
): NextSlugSplitterError =>
  new NextSlugSplitterError('GENERATOR_INVALID', message, context);

/**
 * Create a pipeline execution error.
 *
 * @param message - Human-readable message.
 * @param context - Optional debugging context.
 * @returns Pipeline error instance.
 */
export const createPipelineError = (
  message: string,
  context?: NextSlugSplitterErrorContext
): NextSlugSplitterError =>
  new NextSlugSplitterError('PIPELINE_INVALID', message, context);

/**
 * Create a registry validation error.
 *
 * @param message - Human-readable message.
 * @param context - Optional debugging context.
 * @returns Registry error instance.
 */
export const createRegistryError = (
  message: string,
  context?: NextSlugSplitterErrorContext
): NextSlugSplitterError =>
  new NextSlugSplitterError('REGISTRY_INVALID', message, context);

/**
 * Create a cache validation error.
 *
 * @param message - Human-readable message.
 * @param context - Optional debugging context.
 * @returns Cache error instance.
 */
export const createCacheError = (
  message: string,
  context?: NextSlugSplitterErrorContext
): NextSlugSplitterError =>
  new NextSlugSplitterError('CACHE_INVALID', message, context);

/**
 * Create a route lookup error.
 *
 * @param message - Human-readable message.
 * @param context - Optional debugging context.
 * @returns Lookup error instance.
 */
export const createLookupError = (
  message: string,
  context?: NextSlugSplitterErrorContext
): NextSlugSplitterError =>
  new NextSlugSplitterError('LOOKUP_INVALID', message, context);

/**
 * Create a runtime orchestration error.
 *
 * @param message - Human-readable message.
 * @param context - Optional debugging context.
 * @returns Runtime error instance.
 */
export const createRuntimeError = (
  message: string,
  context?: NextSlugSplitterErrorContext
): NextSlugSplitterError =>
  new NextSlugSplitterError('RUNTIME_INVALID', message, context);
