import { VariableDeclarationKind, type WriterFunction } from 'ts-morph';
import type { JsonObject } from '../../../utils/type-guards-json';

import type { EmitFormat } from '../../../core/types';
import type { ResolvedAppRouteModuleContract } from '../../../next/app/types';
import {
  createGeneratedHeaderLines,
  createHandlerPageInitializer,
  type HandlerLoadableComponentEmitEntry
} from '../../shared/protocol/handler-page-emission';
import {
  createGeneratedSourceFile,
  createSerializableValueInitializer
} from '../../shared/protocol/emitter-utils';
import {
  groupComponentImports,
  renderImportBlock,
  type HandlerComponentImportRecord,
  type HandlerImportDeclarationRecord
} from '../../shared/protocol/import-block';

type AppHandlerPageEmitInput = {
  sourceLocale: string;
  sourceSlugArray: Array<string>;
  handlerId: string;
  usedLoadableComponentKeys: Array<string>;
  runtimeHandlerFactoryImport: string;
  routeContract: string;
  routeBasePath: string;
  componentImports: Array<HandlerComponentImportRecord>;
  componentEntries: Array<HandlerLoadableComponentEmitEntry>;
  factoryBindingValues: Record<string, string | Array<string>>;
  /**
   * Concrete params bag for the exact generated handler route.
   *
   * The preferred App contract binds route identity here and keeps page
   * semantics inside the route-owned contract instead of restating them in the
   * generated page.
   */
  handlerParams: JsonObject;
  emitFormat: EmitFormat;
} & ResolvedAppRouteModuleContract;

const createGenerateMetadataInitializer = (): WriterFunction => {
  return writer => {
    writer.write('return generatePageMetadata(handlerParams);');
  };
};

const createLoadPagePropsReturnStatement = (): WriterFunction => {
  return writer => {
    writer.write('const props = await loadPageProps(handlerParams);');
    writer.newLine();
    writer.newLine();
    writer.write('return <HandlerPage {...props} />;');
  };
};

export const renderAppHandlerPageSource = ({
  sourceLocale,
  sourceSlugArray,
  handlerId,
  usedLoadableComponentKeys,
  runtimeHandlerFactoryImport,
  routeContract,
  routeBasePath,
  componentImports,
  componentEntries,
  factoryBindingValues,
  handlerParams,
  hasGeneratePageMetadata,
  revalidate,
  emitFormat
}: AppHandlerPageEmitInput): string => {
  const sourceFile = createGeneratedSourceFile(
    emitFormat,
    'app-route-handler.generated'
  );

  const importDeclarations: Array<HandlerImportDeclarationRecord> = [
    {
      source: runtimeHandlerFactoryImport,
      namedImports: ['createHandlerPage']
    },
    {
      source: routeContract,
      namedImports: [
        ...(hasGeneratePageMetadata ? ['generatePageMetadata'] : []),
        'loadPageProps'
      ]
    },
    ...groupComponentImports(componentImports)
  ];

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'handlerParams',
        initializer: writer =>
          createSerializableValueInitializer(handlerParams)(writer)
      }
    ]
  });

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'HandlerPage',
        initializer: createHandlerPageInitializer(
          componentEntries,
          factoryBindingValues
        )
      }
    ]
  });

  sourceFile.addVariableStatement({
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'dynamicParams',
        initializer: 'false'
      }
    ]
  });

  if (hasGeneratePageMetadata) {
    sourceFile.addFunction({
      isExported: true,
      name: 'generateMetadata',
      isAsync: true,
      statements: writer => {
        createGenerateMetadataInitializer()(writer);
      }
    });
  }

  sourceFile.addFunction({
    isDefaultExport: true,
    isAsync: true,
    name: 'Page',
    statements: writer => {
      createLoadPagePropsReturnStatement()(writer);
    }
  });

  const headerLines = createGeneratedHeaderLines({
    sourceLocale,
    sourceSlugArray,
    handlerId,
    routeBasePath,
    usedLoadableComponentKeys
  });
  const importBlock = renderImportBlock(importDeclarations);
  const revalidateExportBlock =
    revalidate === undefined
      ? ''
      : `export const revalidate = ${String(revalidate)};\n`;

  sourceFile.formatText({
    indentSize: 2,
    convertTabsToSpaces: true
  });

  return [
    ...headerLines,
    '',
    importBlock,
    revalidateExportBlock.length > 0
      ? `\n${revalidateExportBlock.trimEnd()}`
      : '',
    '',
    sourceFile.getFullText().trimEnd(),
    ''
  ]
    .filter(block => block.length > 0)
    .join('\n');
};
