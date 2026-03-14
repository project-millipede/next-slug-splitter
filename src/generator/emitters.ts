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
import { toRoutePath } from '../core/discovery';
import type {
  EmitFormat,
  NestedExpansionMap,
  RegistryEntry
} from '../core/types';
import { createGeneratorError } from '../utils/errors';
import {
  isArray,
  isBoolean,
  isNull,
  isNumber,
  isString
} from '../utils/type-guards';
import { isObjectRecord } from '../utils/type-guards-custom';
import {
  isNonEmptyArray,
  isNonEmptyString
} from '../utils/type-guards-extended';
import {
  createGeneratedSourceFile,
  createStringArrayInitializer,
  renderStringArrayLiteral,
  writePropertyName,
  type Writer,
  writeStringLiteral
} from './emitter-utils';
import {
  groupComponentImports,
  type HandlerComponentImportRecord,
  type HandlerImportDeclarationRecord,
  renderImportBlock
} from './import-block';

/**
 * Registry entry prepared for emission into a generated handler.
 */
export type HandlerRegistryEmitEntry = Pick<
  RegistryEntry,
  'key' | 'runtimeTraits'
> & {
  /**
   * Local alias for the component in the generated module.
   */
  componentAlias: string;
};

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
   * Base path for public routes in this target.
   */
  routeBasePath: string;
  /**
   * Component imports to include in the generated module.
   */
  componentImports: Array<HandlerComponentImportRecord>;
  /**
   * Nested dependency map for loadable components.
   */
  nestedDependencyMap: NestedExpansionMap;
  /**
   * Registry entries to include in the handler.
   */
  registryEntries: Array<HandlerRegistryEmitEntry>;
  /**
   * Output format for the generated file.
   */
  emitFormat: EmitFormat;
};

/**
 * Writes plain literal data through the writer so emitted object expressions
 * use the same quoting and formatting rules as the rest of the generated file.
 *
 * @param writer - Writer receiving the generated syntax.
 * @param value - Literal value to emit.
 */
const writeLiteralValue = (writer: Writer, value: unknown): void => {
  if (isNull(value)) {
    writer.write('null');
    return;
  }

  if (isString(value)) {
    writeStringLiteral(writer, value);
    return;
  }

  if (isNumber(value) || isBoolean(value)) {
    writer.write(String(value));
    return;
  }

  if (isArray(value)) {
    writer.write('[');
    value.forEach((item, index) => {
      writeLiteralValue(writer, item);
      if (index < value.length - 1) {
        writer.write(',');
      }
    });
    writer.write(']');
    return;
  }

  if (isObjectRecord(value)) {
    const entries = Object.entries(value);
    writer.write('{');
    entries.forEach(([key, entryValue], index) => {
      writePropertyName(writer, key);
      writer.write(': ');
      writeLiteralValue(writer, entryValue);
      if (index < entries.length - 1) {
        writer.write(',');
      }
    });
    writer.write('}');
    return;
  }

  throw createGeneratorError('Unsupported literal value in emitter.');
};

/**
 * Writes one registry entry object into the generated handler module.
 *
 * @param writer - Writer receiving the generated syntax.
 * @param entry - Registry entry data already normalized for emission.
 */
const writeRegistryEntryObject = (
  writer: Writer,
  entry: HandlerRegistryEmitEntry
): void => {
  const fieldWriters: Array<{ key: string; write: WriterFunction }> = [];

  if (!isNonEmptyString(entry.componentAlias)) {
    throw createGeneratorError(
      `Entry "${entry.key}" missing component alias.`
    );
  }

  const componentAlias = entry.componentAlias;
  fieldWriters.push({
    key: 'component',
    write: currentWriter => currentWriter.write(componentAlias)
  });

  if (isNonEmptyArray(entry.runtimeTraits)) {
    const runtimeTraits = entry.runtimeTraits;
    fieldWriters.push({
      key: 'runtimeTraits',
      write: currentWriter =>
        createStringArrayInitializer(runtimeTraits)(currentWriter)
    });
  }

  writer.write('{');

  if (fieldWriters.length > 0) {
    writer.newLine();
    writer.indent(() => {
      fieldWriters.forEach((fieldWriter, index) => {
        writer.write(`${fieldWriter.key}: `);
        fieldWriter.write(writer);
        if (index < fieldWriters.length - 1) writer.write(',');
        writer.newLine();
      });
    });
  }

  writer.write('}');
};

/**
 * Creates the initializer for the emitted `loadableRegistrySubset` object.
 *
 * @param entries - Ordered registry entries selected for the handler.
 * @returns A writer function that emits the registry subset object literal.
 */
const createRegistrySubsetInitializer = (
  entries: Array<HandlerRegistryEmitEntry>
): WriterFunction => {
  return writer => {
    writer.write('{');

    if (entries.length > 0) {
      writer.newLine();
      writer.indent(() => {
        entries.forEach((entry, index) => {
          writePropertyName(writer, entry.key);
          writer.write(': ');
          writeRegistryEntryObject(writer, entry);
          if (index < entries.length - 1) writer.write(',');
          writer.newLine();
        });
      });
    }

    writer.write('}');
  };
};

/**
 * Creates the initializer for the generated handler page instance.
 *
 * @param hasNestedDependencyMap - Whether the emitted module should include the
 * nested expansion map.
 * @returns A writer function that emits the `createHandlerPage(...)` call.
 */
const createHandlerPageInitializer = ({
  hasNestedDependencyMap
}: {
  hasNestedDependencyMap: boolean;
}): WriterFunction => {
  return writer => {
    writer.write('createHandlerPage({');
    writer.newLine();
    writer.indent(() => {
      writer.write('loadableRegistrySubset');
      if (hasNestedDependencyMap) {
        writer.write(',');
        writer.newLine();
        writer.write('nestedExpansionMap: NESTED_DEPENDENCY_MAP');
      }
      writer.newLine();
    });
    writer.write('})');
  };
};

/**
 * Creates the initializer for the generated `getStaticProps` export.
 *
 * @param baseStaticPropsImport - Import specifier of the source page module.
 * @returns A writer function that emits the `createHandlerGetStaticProps(...)`
 * call.
 */
const createHandlerGetStaticPropsInitializer = (
  baseStaticPropsImport: string
): WriterFunction => {
  return writer => {
    writer.write('createHandlerGetStaticProps(');
    writer.newLine();
    writer.indent(() => {
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
 * Builds the banner comment that sits above the generated module.
 *
 * @param sourceLocale - Locale segment of the source route.
 * @param sourceSlugArray - Slug path segments for the source route.
 * @param handlerId - Stable handler identifier.
 * @param routeBasePath - Route base path for the target.
 * @param usedLoadableComponentKeys - Ordered loadable keys required by the page.
 * @returns Header comment lines that are prepended to the emitted module.
 *
 * @remarks
 * This remains string-based because it is file header metadata, not part of
 * the TypeScript module body itself.
 */
const createGeneratedHeaderLines = ({
  sourceLocale,
  sourceSlugArray,
  handlerId,
  routeBasePath,
  usedLoadableComponentKeys
}: {
  sourceLocale: string;
  sourceSlugArray: Array<string>;
  handlerId: string;
  routeBasePath: string;
  usedLoadableComponentKeys: Array<string>;
}): Array<string> => {
  return [
    '// AUTO-GENERATED ROUTE HANDLER. DO NOT EDIT.',
    `// Source: /${sourceLocale}${toRoutePath(routeBasePath, sourceSlugArray)}`,
    `// Handler: ${handlerId}`,
    `// Used loadable keys: ${renderStringArrayLiteral(usedLoadableComponentKeys)}`
  ];
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
  routeBasePath,
  componentImports,
  nestedDependencyMap,
  registryEntries,
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

  const hasNestedDependencyMap = Object.keys(nestedDependencyMap).length > 0;

  const importDeclarations: Array<HandlerImportDeclarationRecord> = [];

  importDeclarations.push({
    source: runtimeHandlerFactoryImport,
    namedImports: ['createHandlerPage', 'createHandlerGetStaticProps']
  });

  for (const componentImport of groupComponentImports(componentImports)) {
    importDeclarations.push(componentImport);
  }

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'handlerSlug',
        initializer: createStringArrayInitializer(sourceSlugArray)
      }
    ]
  });

  if (hasNestedDependencyMap) {
    sourceFile.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: 'NESTED_DEPENDENCY_MAP',
          initializer: writer => writeLiteralValue(writer, nestedDependencyMap)
        }
      ]
    });
  }

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'loadableRegistrySubset',
        initializer: createRegistrySubsetInitializer(registryEntries)
      }
    ]
  });

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'HandlerPage',
        initializer: createHandlerPageInitializer({
          hasNestedDependencyMap
        })
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
