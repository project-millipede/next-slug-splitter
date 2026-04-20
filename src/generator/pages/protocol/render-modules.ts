/**
 * Prepares semantic emit input for route-handler source generation.
 *
 * @remarks
 * This file stays syntax-agnostic. It resolves the Pages Router-specific
 * handler render contract and delegates shared handler-page emit preparation to
 * `shared/protocol/render-modules.ts`.
 * Direct source rendering remains delegated to the emitter layer.
 */
import { toEmittedImportSpecifier } from '../../../module-reference';

import { renderHandlerPageSource } from './emitters';
import { prepareHandlerEmitInput } from '../../shared/protocol/render-modules';

import type {
  DynamicRouteParam,
  EmitFormat,
  LoadableComponentEntry,
  ResolvedFactoryBindings
} from '../../../core/types';

/**
 * Fully prepared render config for one generated handler module.
 */
export type PreparedHandlerRenderConfig = {
  /**
   * Absolute path of the generated handler page.
   */
  pageFilePath: string;
  /**
   * Final runtime handler factory import specifier written into the generated
   * module.
   */
  runtimeHandlerFactoryImport: string;
  /**
   * Final route-contract import specifier written into the generated module.
   */
  routeContract: string;
  /**
   * Dynamic route parameter descriptor for the handler page.
   */
  handlerRouteParam: DynamicRouteParam;
  /**
   * Base path for public routes in this target.
   */
  routeBasePath: string;
  /**
   * Output format for the generated file.
   */
  emitFormat: EmitFormat;
};

/**
 * Input for rendering handler source modules.
 */
type HandlerSourceInput = {
  /**
   * Locale of the source route.
   */
  locale: string;
  /**
   * Slug path segments for the source route.
   */
  slugArray: Array<string>;
  /**
   * Stable identifier for the handler.
   */
  handlerId: string;
  /**
   * Loadable component keys used by this route.
   */
  usedLoadableComponentKeys: Array<string>;
  /**
   * Optional resolved route-level factory bindings forwarded into emission.
   */
  factoryBindings?: ResolvedFactoryBindings;
  /**
   * Loadable component entries selected for this handler.
   */
  selectedComponentEntries: Array<LoadableComponentEntry>;
  /**
   * Fully prepared render config for the generated module.
   */
  renderConfig: PreparedHandlerRenderConfig;
};

/**
 * Resolves the final semantic inputs required to emit one generated route
 * handler module and delegates actual source rendering to `emitters.ts`.
 *
 * @param input - Semantic handler source input.
 * @returns Complete source text for the generated handler page.
 */
export const renderRouteHandlerModules = ({
  locale,
  slugArray,
  handlerId,
  usedLoadableComponentKeys,
  factoryBindings,
  selectedComponentEntries,
  renderConfig
}: HandlerSourceInput): string => {
  const { componentImports, componentEntries, factoryBindingValues } =
    prepareHandlerEmitInput({
      selectedComponentEntries,
      pageFilePath: renderConfig.pageFilePath,
      factoryBindings
    });

  return renderHandlerPageSource({
    sourceLocale: locale,
    sourceSlugArray: slugArray,
    handlerId,
    usedLoadableComponentKeys,
    runtimeHandlerFactoryImport: renderConfig.runtimeHandlerFactoryImport,
    routeContract: renderConfig.routeContract,
    handlerRouteParam: renderConfig.handlerRouteParam,
    routeBasePath: renderConfig.routeBasePath,
    componentImports,
    componentEntries,
    factoryBindingValues,
    emitFormat: renderConfig.emitFormat
  });
};
