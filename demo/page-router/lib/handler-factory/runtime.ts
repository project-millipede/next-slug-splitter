/**
 * Shared demo handler factory.
 *
 * Both demo paths use this same factory:
 *
 * - The light catch-all page passes an empty registry subset, so there are no
 *   component entries and no runtime traits to apply.
 * - Generated heavy handlers pass only the captured component subset for that
 *   page, including any runtime-trait metadata emitted by the processor.
 *
 * When runtime traits are present, the shared runtime applies the demo's small
 * visible enhancements:
 *
 * - `wrapper`   -> highlighted outer shell
 * - `selection` -> dashed selection shell
 *
 * A component can declare both traits and receive both wrappers.
 */
import { createHandlerPageFromRuntime } from './index';

export const createHandlerPage = createHandlerPageFromRuntime;
