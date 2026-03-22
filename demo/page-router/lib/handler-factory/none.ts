/**
 * Handler factory variant: none
 *
 * Factory variants control what runtime enhancements are applied to the
 * components rendered inside a generated handler page. Each variant binds
 * a different runtime that wraps the component set before rendering.
 *
 * Available variants (the demo only uses `none`):
 *
 * - **none**      — No enhancements. Components render as-is.
 * - **wrapper**   — Wraps components in a provider (e.g. Jotai store) when
 *                   the component declares the `wrapper` runtime trait.
 * - **selection** — Injects interactive selection wiring (e.g. anchor IDs,
 *                   playlist scoping) for components with the `selection`
 *                   runtime trait.
 *
 * The code generator references the variant by name in each generated handler
 * page import, so the correct variant is selected per handler at build time
 * based on the runtime traits of its component set.
 *
 * This file simply re-exports the base factory without any additional runtime
 * behavior, which is sufficient for the demo's components.
 */
import { createHandlerPageFromRuntime } from './index';

export const createHandlerPage = createHandlerPageFromRuntime;
