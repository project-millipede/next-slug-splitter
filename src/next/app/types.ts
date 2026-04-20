import type {
  ProcessorRouteHandlerBinding,
  CreateCatchAllRouteHandlersPresetBaseOptions,
  RouteHandlersAppConfig as SharedRouteHandlersAppConfig,
  RouteHandlersEntrypointInput as SharedRouteHandlersEntrypointInput,
  ResolvedRouteHandlersConfigWithLocale,
  ResolvedRouteHandlersAppConfig,
  ResolvedRouteHandlersTargetConfigBase,
  RouteHandlersConfigBase,
  RouteHandlersTargetConfigBase
} from '../shared/types';
import type {
  LocaleConfig,
  ResolvedRouteHandlerModuleReference,
  RouteHandlerModuleReference
} from '../../core/types';
import type { ResolvedModuleReference } from '../../module-reference';
import type { JsonValue } from '../../utils/type-guards-json';

export type AppRouteStaticParamValue = string | Array<string> | undefined;

/**
 * Param bag shape shared by App Router route-module helpers.
 */
export type AppRouteParams = Record<string, AppRouteStaticParamValue>;

/**
 * Canonical App-owned static-params enumerator shared by the public light page
 * and generated heavy pages.
 */
export type GetAppRouteStaticParams<
  TParams extends AppRouteParams = AppRouteParams
> = () => Array<TParams> | Promise<Array<TParams>>;

/**
 * App-owned page helper that loads the props consumed by the public light page
 * and generated heavy pages.
 *
 * @remarks
 * App Router does not expose a built-in `getStaticProps` equivalent, so the
 * preferred contract gives both page variants one explicit shared page helper.
 */
export type LoadAppPageProps<
  TParams extends AppRouteParams = AppRouteParams,
  TRouteData = unknown
> = (params: TParams) => TRouteData | Promise<TRouteData>;

/**
 * Optional App-owned page metadata helper shared by the public light page and
 * generated heavy pages.
 */
export type GenerateAppPageMetadata<
  TParams extends AppRouteParams = AppRouteParams,
  TMetadata = unknown
> = (params: TParams) => TMetadata | Promise<TMetadata>;

/**
 * Serializable invocation shape shared by the public page-data compiler helper
 * and by app-authored page-data compiler modules.
 */
export type AppPageDataCompilerCompileInput<
  TInput extends JsonValue = JsonValue
> = {
  /**
   * Stable target identifier used to look up the configured compiler module.
   */
  targetId: string;
  /**
   * Serializable payload chosen by the route contract.
   */
  input: TInput;
};

/**
 * App-owned page-data compiler executed by the library in an isolated worker.
 */
export type AppPageDataCompiler<
  TInput extends JsonValue = JsonValue,
  TResult extends JsonValue = JsonValue
> = {
  /**
   * Compile or otherwise prepare page data outside the Next server process.
   */
  compile: (
    input: AppPageDataCompilerCompileInput<TInput>
  ) => TResult | Promise<TResult>;
};

/**
 * Preferred App Router page contract owned by the route folder.
 *
 * @remarks
 * This is the closest App Router analogue to the Pages Router `getStaticProps`
 * seam:
 * - the public catch-all page calls it directly
 * - generated heavy pages call it directly
 * - workers do not own these page semantics
 */
export type AppRoutePageContract<
  TParams extends AppRouteParams = AppRouteParams
> = {
  /**
   * Enumerate every params object the target can statically generate.
   */
  getStaticParams: GetAppRouteStaticParams<TParams>;
  /**
   * Load the route data consumed by page rendering.
   */
  loadPageProps: LoadAppPageProps<TParams>;
  /**
   * Optional metadata helper mirrored into generated heavy pages.
   */
  generatePageMetadata?: GenerateAppPageMetadata<TParams>;
  /**
   * Optional segment revalidation value mirrored into generated heavy pages.
   */
  revalidate?: number | false;
};

/**
 * Build-time inspection result for one resolved App Router route contract.
 */
export type ResolvedAppRouteModuleContract = {
  /**
   * Whether the route contract exports `generatePageMetadata`.
   */
  hasGeneratePageMetadata: boolean;
  /**
   * Literal `revalidate` value exported by the route contract when present.
   */
  revalidate?: number | false;
};

/**
 * App-only extension of the shared processor binding.
 */
export type AppRouteHandlerBinding = ProcessorRouteHandlerBinding & {
  /**
   * App-owned page-data compiler module executed by the library in an
   * isolated worker.
   *
   * This stays separate from `processorImport`: processors own generation
   * planning, while page-data compilers own isolated page-data preparation.
   */
  pageDataCompilerImport?: RouteHandlerModuleReference;
};

/**
 * App-owned multi-locale config used at the public config boundary.
 *
 * @remarks
 * Single-locale App Router setups omit `app.localeConfig` entirely.
 */
export type AppRouteHandlersLocaleConfig = {
  /**
   * Supported locale codes for the App Router target set.
   */
  locales: Array<string>;
  /**
   * Default locale used for canonical locale-less ownership.
   */
  defaultLocale: string;
};

/**
 * App-owned app-level config that extends the shared app config with the
 * optional declarative locale contract.
 */
export type AppRouteHandlersAppConfig = SharedRouteHandlersAppConfig & {
  /**
   * Declarative locale contract for multi-locale App Router flows.
   *
   * Omit this field entirely for single-locale apps.
   */
  localeConfig?: AppRouteHandlersLocaleConfig;
};

/**
 * App Router target config.
 */
export type RouteHandlersTargetConfig = Omit<
  RouteHandlersTargetConfigBase,
  'handlerBinding'
> & {
  /**
   * App-only handler binding that extends the shared processor binding.
   */
  handlerBinding: AppRouteHandlerBinding;
  /**
   * Route-owned App page contract imported by the public page and generated
   * heavy pages.
   *
   * @remarks
   * App Router uses this field as one dedicated route-owned contract seam.
   *
   * Key aspects:
   * 1. This is typically a dedicated sibling file such as
   *    `app/docs/[...slug]/route-contract.ts`, not the public page module
   *    itself.
   * 2. The public light catch-all page and the generated heavy pages both call
   *    into this same contract.
   * 3. Unlike the Pages Router path, route enumeration also lives here through
   *    `getStaticParams`.
   * 4. The same contract therefore owns both route enumeration and page-data
   *    loading for the App route surface.
   *
   * Required/optional exports:
   * - `getStaticParams`
   * - `loadPageProps(params)`
   * - optional `generatePageMetadata(params)`
   * - optional `revalidate`
   */
  routeContract: RouteHandlerModuleReference;
};

/**
 * App Router config container.
 */
export type RouteHandlersConfig = Omit<
  RouteHandlersConfigBase<RouteHandlersTargetConfig>,
  'app'
> & {
  /**
   * Router family discriminator for the App Router path.
   */
  routerKind: 'app';
  /**
   * App-owned app-level config, including the optional multi-locale contract.
   */
  app?: AppRouteHandlersAppConfig;
};

/**
 * Options for creating a catch-all App Router preset.
 */
export type CreateAppCatchAllRouteHandlersPresetOptions =
  CreateCatchAllRouteHandlersPresetBaseOptions<AppRouteHandlerBinding>;

/**
 * App Router entrypoint input.
 */
export type RouteHandlersEntrypointInput =
  SharedRouteHandlersEntrypointInput<RouteHandlersConfig>;

/**
 * Resolved App Router base config.
 */
export type ResolvedRouteHandlersConfigBase =
  ResolvedRouteHandlersTargetConfigBase & {
    /**
     * Router family discriminator for the App Router contract.
     */
    routerKind: 'app';
    /**
     * Resolved app-level configuration.
     */
    app: ResolvedRouteHandlersAppConfig;
    /**
     * Resolved route-contract import used by App Router helpers and generated
     * heavy pages.
     */
    routeContract: ResolvedRouteHandlerModuleReference;
    /**
     * Internal App Router segment used for generated handler destinations.
     */
    handlerRouteSegment: string;
    /**
     * Build-time inspection result for the resolved route contract.
     */
    routeModule: ResolvedAppRouteModuleContract;
    /**
     * Optional resolved page-data compiler configuration used by App Router
     * route contracts at page time through an isolated library-owned worker.
     */
    pageDataCompilerConfig?: {
      pageDataCompilerImport: ResolvedModuleReference;
    };
  };

/**
 * Fully resolved App Router config.
 */
export type ResolvedRouteHandlersConfig =
  ResolvedRouteHandlersConfigWithLocale<ResolvedRouteHandlersConfigBase>;
