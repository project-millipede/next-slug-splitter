/**
 * Handler factory variant: runtime-aware demo wrapper.
 *
 * This binds the shared demo handler runtime that reads per-entry metadata from
 * the generated registry subset. The demo uses tiny visible behaviors:
 *
 * - `wrapper`   -> highlighted outer shell
 * - `selection` -> dashed selection shell
 *
 * A component can declare both traits and receive both wrappers.
 */
import { createHandlerPageFromRuntime } from './index';

export const createHandlerPage = createHandlerPageFromRuntime;
