import type { AppPageDataCompiler } from './types';
import type { JsonValue } from '../../utils/type-guards-json';

/**
 * Public identity helper for app-owned App Router page-data compilers.
 *
 * This helper intentionally lives in a tiny leaf module so compiler modules
 * can import it without also pulling in runtime-only worker dependencies.
 *
 * @template TInput Serializable input payload accepted by the compiler.
 * @template TResult Serializable result payload returned by the compiler.
 * @param compiler Authored compiler object exported by the application.
 * @returns The same compiler object, preserving its generic types.
 */
export const definePageDataCompiler = <
  TInput extends JsonValue = JsonValue,
  TResult extends JsonValue = JsonValue
>(
  compiler: AppPageDataCompiler<TInput, TResult>
): AppPageDataCompiler<TInput, TResult> => compiler;
