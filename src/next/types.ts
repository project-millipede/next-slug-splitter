/**
 * Public type aggregation entrypoint shared by the value exports in
 * `src/next/index.ts` and the dedicated subpath helpers.
 */
import type {
  CreateAppCatchAllRouteHandlersPresetOptions as CreateAppCatchAllRouteHandlersPresetOptionsInput,
  RouteHandlersEntrypointInput as AppRouteHandlersEntrypointInputInput,
  RouteHandlersConfig as AppRouteHandlersConfigInput,
  RouteHandlersTargetConfig as AppRouteHandlersTargetConfigInput,
  ResolvedRouteHandlersConfig as ResolvedAppRouteHandlersConfig
} from './app/types';
import type {
  CreateCatchAllRouteHandlersPresetOptions as CreateCatchAllRouteHandlersPresetOptionsInput,
  RouteHandlersEntrypointInput as PagesRouteHandlersEntrypointInputInput,
  RouteHandlersConfig as PagesRouteHandlersConfigInput,
  RouteHandlersTargetConfig as PagesRouteHandlersTargetConfigInput,
  ResolvedRouteHandlersConfig as ResolvedPagesRouteHandlersConfig
} from './pages/types';

export type {
  AppPageDataCompiler,
  AppPageDataCompilerCompileInput,
  AppRoutePageContract,
  AppRouteParams,
  AppRouteStaticParamValue,
  GenerateAppPageMetadata,
  GetAppRouteStaticParams,
  LoadAppPageProps,
  ResolvedAppRouteModuleContract
} from './app/types';
export type {
  RouteHandlerRouterKind
} from './shared/types';

export type AppRouteHandlersConfig = AppRouteHandlersConfigInput;
export type CreateAppCatchAllRouteHandlersPresetOptions =
  CreateAppCatchAllRouteHandlersPresetOptionsInput;
export type CreateCatchAllRouteHandlersPresetOptions =
  CreateCatchAllRouteHandlersPresetOptionsInput;
export type AppRouteHandlersEntrypointInput =
  AppRouteHandlersEntrypointInputInput;
export type AppRouteHandlersTargetConfig = AppRouteHandlersTargetConfigInput;
export type PagesRouteHandlersConfig = PagesRouteHandlersConfigInput;
export type PagesRouteHandlersEntrypointInput =
  PagesRouteHandlersEntrypointInputInput;
export type PagesRouteHandlersTargetConfig = PagesRouteHandlersTargetConfigInput;

/**
 * Public config union covering both supported router families.
 */
export type RouteHandlersConfig =
  | PagesRouteHandlersConfig
  | AppRouteHandlersConfig;

/**
 * Public entrypoint-input union covering both supported router families.
 */
export type RouteHandlersEntrypointInput =
  | PagesRouteHandlersEntrypointInput
  | AppRouteHandlersEntrypointInput;

/**
 * Public target-config union covering both supported router families.
 */
export type RouteHandlersTargetConfig =
  | PagesRouteHandlersTargetConfig
  | AppRouteHandlersTargetConfig;

/**
 * Internal resolved-config union covering both supported router families.
 */
export type ResolvedRouteHandlersConfig =
  | ResolvedPagesRouteHandlersConfig
  | ResolvedAppRouteHandlersConfig;
