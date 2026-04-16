/**
 * Dedicated public subpath for page-data compiler authors.
 *
 * This surface intentionally exposes only the lightweight compiler contract so
 * authored compiler modules do not pull in route-runtime worker helpers.
 */
export type {
  AppPageDataCompiler,
  AppPageDataCompilerCompileInput
} from './types';
export { definePageDataCompiler } from './app/page-data-compiler-define';
