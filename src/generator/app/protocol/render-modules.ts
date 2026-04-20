import type { JsonObject } from '../../../utils/type-guards-json';
import type {
  EmitFormat,
  LoadableComponentEntry,
  ResolvedFactoryBindings
} from '../../../core/types';
import type { ResolvedAppRouteModuleContract } from '../../../next/app/types';
import { prepareHandlerEmitInput } from '../../shared/protocol/render-modules';
import { renderAppHandlerPageSource } from './emitters';

export type PreparedAppHandlerRenderConfig = {
  pageFilePath: string;
  runtimeHandlerFactoryImport: string;
  routeContract: string;
  routeBasePath: string;
  emitFormat: EmitFormat;
  handlerParams: JsonObject;
} & ResolvedAppRouteModuleContract;

type AppHandlerSourceInput = {
  locale: string;
  slugArray: Array<string>;
  handlerId: string;
  usedLoadableComponentKeys: Array<string>;
  factoryBindings?: ResolvedFactoryBindings;
  selectedComponentEntries: Array<LoadableComponentEntry>;
  renderConfig: PreparedAppHandlerRenderConfig;
};

export const renderAppRouteHandlerModules = ({
  locale,
  slugArray,
  handlerId,
  usedLoadableComponentKeys,
  factoryBindings,
  selectedComponentEntries,
  renderConfig
}: AppHandlerSourceInput): string => {
  const { componentImports, componentEntries, factoryBindingValues } =
    prepareHandlerEmitInput({
      selectedComponentEntries,
      pageFilePath: renderConfig.pageFilePath,
      factoryBindings
    });

  return renderAppHandlerPageSource({
    sourceLocale: locale,
    sourceSlugArray: slugArray,
    handlerId,
    usedLoadableComponentKeys,
    runtimeHandlerFactoryImport: renderConfig.runtimeHandlerFactoryImport,
    routeContract: renderConfig.routeContract,
    routeBasePath: renderConfig.routeBasePath,
    componentImports,
    componentEntries,
    factoryBindingValues,
    handlerParams: renderConfig.handlerParams,
    hasGeneratePageMetadata: renderConfig.hasGeneratePageMetadata,
    revalidate: renderConfig.revalidate,
    emitFormat: renderConfig.emitFormat
  });
};
