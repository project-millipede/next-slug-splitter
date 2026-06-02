import type { GetStaticPaths, GetStaticProps, GetStaticPropsContext } from 'next';
import type { ParsedUrlQuery } from 'node:querystring';
import {
  resolveRouteParamValue,
  type DynamicRouteParam
} from '../shared/types';

/**
 * Signature for the handler's `getStaticProps` function.
 *
 * Uses Next.js's own `GetStaticProps` type directly so that modules
 * loaded via dynamic `import()` are assignable without narrowing —
 * their `getStaticProps` export already satisfies this type.
 */
export type HandlerStaticProps = GetStaticProps;

/**
 * Async loader that returns a module exporting `getStaticProps`.
 *
 * The generated handler uses a dynamic `import()` expression to lazily
 * load the catch-all page module.  This keeps the handler's own module
 * graph minimal — only the components it needs are statically imported,
 * while the shared data-fetching logic is loaded on demand.
 */
export type HandlerStaticPropsLoader = () => Promise<{
  getStaticProps: HandlerStaticProps;
}>;

// ---------------------------------------------------------------------------
// Params merging
// ---------------------------------------------------------------------------

/**
 * Build the `params` object for the delegated `getStaticProps` call.
 *
 * Preserves any existing params from the incoming context (e.g. locale)
 * and sets the route-param key to the resolved value derived from the
 * handler's fixed slug segments and the {@link DynamicRouteParam} kind.
 */
const buildDelegatedParams = (
  ctx: GetStaticPropsContext,
  handlerRouteParam: DynamicRouteParam,
  fixedSlug: Array<string>
): ParsedUrlQuery => {
  const existingParams = ctx.params ?? {};
  const resolvedValue = resolveRouteParamValue(handlerRouteParam, fixedSlug);

  return {
    ...existingParams,
    [handlerRouteParam.name]: resolvedValue
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a `getStaticProps` function for a generated handler page.
 *
 * A generated handler page doesn't own any data-fetching logic — it
 * delegates to the catch-all page's `getStaticProps`.  This function
 * wires up that delegation:
 *
 * 1. Lazily loads the catch-all page module via `loadStaticProps`.
 * 2. Merges the incoming context's `params` with the handler's fixed
 *    slug, resolved to the value shape that Next.js expects for the
 *    given {@link DynamicRouteParam} kind (see {@link resolveRouteParamValue}).
 * 3. Calls the catch-all's `getStaticProps` with the enriched context.
 *
 * All three arguments are known at code-generation time — the code
 * generator emits calls to this function directly, so no app-layer
 * boilerplate is required.
 *
 * @param handlerRouteParam - Route parameter descriptor from the target config.
 * @param fixedSlug - Fixed slug segments identifying this handler
 *   (e.g. `['interactive']`).
 * @param loadStaticProps - Lazy loader that dynamically imports the
 *   catch-all page and exposes its `getStaticProps`.
 * @returns A `getStaticProps` function the generated handler can export directly.
 *
 * @example
 * ```ts
 * // Emitted by the code generator into a handler page:
 * import { createHandlerGetStaticProps } from 'next-slug-splitter/next/handler';
 *
 * export const getStaticProps = createHandlerGetStaticProps(
 *   { name: 'slug', kind: 'catch-all' },
 *   ['interactive'],
 *   () => import('../[...slug]')
 * );
 * ```
 */
export const createHandlerGetStaticProps = (
  handlerRouteParam: DynamicRouteParam,
  fixedSlug: Array<string>,
  loadStaticProps: HandlerStaticPropsLoader
): HandlerStaticProps => {
  return async (ctx: GetStaticPropsContext) => {
    const { getStaticProps } = await loadStaticProps();
    const params = buildDelegatedParams(ctx, handlerRouteParam, fixedSlug);

    return getStaticProps({ ...ctx, params });
  };
};

// ---------------------------------------------------------------------------
// getStaticPaths enumeration (locale fan-out elimination)
// ---------------------------------------------------------------------------

/**
 * Route-param name of the generated optional catch-all handler leaf
 * (`[[...rest]].tsx`).
 *
 * The leaf is vestigial: it exists only so a generated handler page can export
 * `getStaticPaths` (illegal on a fixed page) and thereby pin its locale instead
 * of fanning out across every configured i18n locale. The param value is always
 * the empty array — the bare base path the handler owns.
 *
 * This constant is the single source of truth shared by the runtime helper
 * below and the generator's file-location resolver, so the emitted filename
 * (`[[...rest]]`) and the enumerated `params` key can never drift apart.
 */
export const HANDLER_CATCHALL_PARAM = 'rest';

/**
 * One enumerated `(path, locale)` pair owned by a generated handler page.
 */
export type HandlerStaticPathsEntry = {
  /**
   * Optional catch-all segments for the entry. Always `[]` — the bare base
   * route a generated handler owns.
   */
  rest: Array<string>;
  /**
   * The i18n locale this entry is prerendered for. Setting it explicitly stops
   * Next from fanning the page out across every configured locale.
   */
  locale: string;
};

/**
 * Create a `getStaticPaths` function for a generated handler page.
 *
 * A generated handler page sits under an optional catch-all leaf
 * (`[[...rest]].tsx`) purely so it can export this function. Enumerating the
 * exact `(params, locale)` pairs the handler owns — with `fallback: false` —
 * restricts prerendering to those pairs, so a slug heavy in `H` of `L` locales
 * builds `H` times instead of `H·L`.
 *
 * @param entries - Explicit owned entries. The generator passes one entry per
 *   owned `(locale, slug)`; `rest` is the (empty) catch-all value and `locale`
 *   is the pinned i18n locale. Explicit entries keep test fixtures trivial.
 * @returns A `getStaticPaths` function the generated handler can export directly.
 *
 * @example
 * ```ts
 * // Emitted by the code generator into a handler page:
 * export const getStaticPaths = createHandlerGetStaticPaths([
 *   { rest: [], locale: 'en' }
 * ]);
 * ```
 */
export const createHandlerGetStaticPaths =
  (entries: Array<HandlerStaticPathsEntry>): GetStaticPaths =>
  () => ({
    paths: entries.map(({ rest, locale }) => ({
      params: { [HANDLER_CATCHALL_PARAM]: rest },
      locale
    })),
    fallback: false
  });
