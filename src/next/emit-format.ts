import type { EmitFormat } from '../core/types';

/**
 * Object carrying an emit format value.
 */
export type EmitFormatCarrier = {
  /**
   * Output format for generated files.
   */
  emitFormat: EmitFormat;
};

/**
 * Input for resolving the shared emit format across targets.
 */
export type ResolveSharedEmitFormatInput = {
  /**
   * Target configs to compare emit formats.
   */
  configs: Array<EmitFormatCarrier>;
  /**
   * Error factory for validation failures.
   */
  createError: (message: string) => Error;
};

/**
 * Resolve the shared emitted file format across all configured targets.
 *
 * @param input - Emit-format resolution input.
 * @returns The one emit format shared by every target.
 * @throws If no targets are resolved or targets disagree on `emitFormat`.
 */
export const resolveSharedEmitFormat = ({
  configs,
  createError
}: ResolveSharedEmitFormatInput): EmitFormat => {
  if (configs.length === 0) {
    throw createError('No resolved targets.');
  }

  const [referenceResolvedConfig] = configs;
  const referenceEmitFormat = referenceResolvedConfig.emitFormat;
  for (const config of configs) {
    if (config.emitFormat !== referenceEmitFormat) {
      throw createError('All resolved targets must use the same emitFormat.');
    }
  }

  return referenceEmitFormat;
};
