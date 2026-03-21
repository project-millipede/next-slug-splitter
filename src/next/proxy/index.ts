/**
 * Internal proxy runtime entrypoint.
 *
 * @remarks
 * This entry is consumed by the plugin-generated root `proxy.ts` file. It is
 * published as a package subpath so the generated file can delegate request
 * routing back into the library while keeping the actual root file extremely
 * small and fully plugin-owned.
 *
 * The exported entry intentionally stays tiny:
 * - file lifecycle is handled separately by `file-lifecycle.ts`
 * - request-state loading is handled by `routing-state.ts`
 * - per-request decision logic is handled by `request-routing.ts`
 */
export { proxy } from './runtime';
