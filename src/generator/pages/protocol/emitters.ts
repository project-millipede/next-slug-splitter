/**
 * Emits concrete route-handler source modules.
 *
 * @remarks
 * This file is the generator's syntax-emission boundary. It owns the emitted
 * module body, declarations, export statements, and final formatting through
 * `ts-morph`.
 *
 * Imports are the one exception: they remain delegated to
 * `import-block.ts` because the generated import layout is part of the output
 * contract and must preserve the current single-line vs. multiline behavior.
 * `SourceFile.addImportDeclarations(...)` does not provide that level of
 * stable formatting control.
 */
import { VariableDeclarationKind, type WriterFunction } from 'ts-morph';
import type { DynamicRouteParam, EmitFormat, LoadableComponentEntry } from '../../../core/types';
import {
  createGeneratedSourceFile,
  writeStringLiteral
} from '../../shared/protocol/emitter-utils';
import { writeStringArray } from '../../shared/protocol/array-literal';
import {
  createGeneratedHeaderLines,
  createHandlerPageInitializer,
  type HandlerLoadableComponentEmitEntry
} from '../../shared/protocol/handler-page-emission';
import {
  groupComponentImports,
  type HandlerComponentImportRecord,
  type HandlerImportDeclarationRecord,
  renderImportBlock
} from '../../shared/protocol/import-block';

/**
 * Input data required to emit one handler page module.
 */
type HandlerPageEmitInput = {
  /**
   * Locale of the source content route.
   */
  sourceLocale: string;
  /**
   * Slug path segments for the source route.
   */
  sourceSlugArray: Array<string>;
  /**
   * Stable identifier for the handler.
   */
  handlerId: string;
  /**
   * Loadable component keys used by this route.
   */
  usedLoadableComponentKeys: Array<string>;
  /**
   * Import path for the runtime handler factory.
   */
  runtimeHandlerFactoryImport: string;
  /**
   * Import path for the base static props module.
   */
  baseStaticPropsImport: string;
  /**
   * Dynamic route parameter descriptor for the handler page.
   */
  handlerRouteParam: DynamicRouteParam;
  /**
   * Base path for public routes in this target.
   */
  routeBasePath: string;
  /**
   * Component imports to include in the generated module.
   */
  componentImports: Array<HandlerComponentImportRecord>;
  /**
   * Loadable component entries to include in the handler.
   */
  componentEntries: Array<HandlerLoadableComponentEmitEntry>;
  /**
   * Route-level bindings forwarded into `createHandlerPage(...)`.
   */
  factoryBindingValues: Record<string, string | Array<string>>;
  /**
   * Output format for the generated file.
   */
  emitFormat: EmitFormat;
};


/**
 * Creates the initializer for the generated `getStaticProps` export.
 *
 * Emits a call to the library's `createHandlerGetStaticProps` with the
 * route-param descriptor inlined from the target config, the handler's
 * fixed slug, and a lazy import of the catch-all page's static props.
 *
 * @param handlerRouteParam - Route parameter descriptor from the target config.
 * @param baseStaticPropsImport - Import specifier of the source page module.
 * @returns A writer function that emits the `createHandlerGetStaticProps(...)` call.
 */
const createHandlerGetStaticPropsInitializer = (
  handlerRouteParam: DynamicRouteParam,
  baseStaticPropsImport: string
): WriterFunction => {
  return writer => {
    writer.write('createHandlerGetStaticProps(');
    writer.newLine();
    writer.indent(() => {
      writer.write('{ name: ');
      writeStringLiteral(writer, handlerRouteParam.name);
      writer.write(', kind: ');
      writeStringLiteral(writer, handlerRouteParam.kind);
      writer.write(' },');
      writer.newLine();
      writer.write('handlerSlug,');
      writer.newLine();
      writer.write('() => import(');
      writeStringLiteral(writer, baseStaticPropsImport);
      writer.write(')');
      writer.newLine();
    });
    writer.write(')');
  };
};

/**
 * Renders the full source text for one generated route-handler module.
 *
 * @param input - Fully prepared handler-page emission input.
 * @returns Complete source text for the generated route-handler file.
 */
export const renderHandlerPageSource = ({
  sourceLocale,
  sourceSlugArray,
  handlerId,
  usedLoadableComponentKeys,
  runtimeHandlerFactoryImport,
  baseStaticPropsImport,
  handlerRouteParam,
  routeBasePath,
  componentImports,
  componentEntries,
  factoryBindingValues,
  emitFormat
}: HandlerPageEmitInput): string => {
  /**
   * `ts-morph` owns the module body from this point on.
   * Import rendering remains delegated to `renderImportBlock(...)` so the
   * exact grouped multiline layout of the generated imports stays unchanged.
   */
  const sourceFile = createGeneratedSourceFile(
    emitFormat,
    'route-handler.generated'
  );

  const importDeclarations: Array<HandlerImportDeclarationRecord> = [];

  // Static props binding comes from the library — it's pure plumbing that
  // doesn't depend on the app's component wiring.
  importDeclarations.push({
    source: 'next-slug-splitter/next/handler',
    namedImports: ['createHandlerGetStaticProps']
  });

  // Page component factory comes from the app — it's the genuinely
  // app-specific part that knows how to wire components into the page.
  importDeclarations.push({
    source: runtimeHandlerFactoryImport,
    namedImports: ['createHandlerPage']
  });

  for (const componentImport of groupComponentImports(componentImports)) {
    importDeclarations.push(componentImport);
  }

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'handlerSlug',
        initializer: writer => writeStringArray(writer, sourceSlugArray)
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
        name: 'getStaticProps',
        initializer: createHandlerGetStaticPropsInitializer(
          handlerRouteParam,
          baseStaticPropsImport
        )
      }
    ]
  });

  sourceFile.addExportAssignment({
    isExportEquals: false,
    expression: 'HandlerPage'
  });

  const headerLines = createGeneratedHeaderLines({
    sourceLocale,
    sourceSlugArray,
    handlerId,
    routeBasePath,
    usedLoadableComponentKeys
  });
  /**
   * Imports stay in a dedicated formatter because the exact import block shape
   * is part of the generated file contract.
   */
  const importBlock = renderImportBlock(importDeclarations);
  sourceFile.formatText({
    indentSize: 2,
    convertTabsToSpaces: true
  });
  const body = sourceFile.getFullText().trimEnd();

  return [...headerLines, '', importBlock, '', body, ''].join('\n');
};
