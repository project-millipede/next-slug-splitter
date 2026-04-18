/**
 * Renders the generated import block.
 *
 * @remarks
 * This file remains a dedicated formatter instead of delegating imports to
 * `SourceFile.addImportDeclarations(...)`.
 *
 * Generated handlers rely on the current import presentation, especially
 * grouped multiline named imports. This module preserves that shape exactly
 * while still using `CodeBlockWriter` from `ts-morph` for quoting and
 * indentation behavior.
 */
import type { ComponentImportKind } from '../../../core/types';
import { isString } from '../../../utils/type-guards';
import {
  createGeneratorWriter,
  writeStringLiteral,
  type Writer
} from './emitter-utils';

/**
 * Component import record with resolved local alias and emitted source specifier.
 */
export type HandlerComponentImportRecord = {
  /**
   * Emitted import source specifier.
   */
  source: string;

  /**
   * Kind of import (default or named).
   */
  kind: ComponentImportKind;

  /**
   * Name of the exported symbol being imported.
   */
  importedName: string;

  /**
   * Local alias used for the imported component.
   */
  alias: string;
};

/**
 * Named import specifier, either as plain string or with alias.
 *
 * Variants:
 * - string: Direct named import (name equals local identifier).
 * - { name, alias }: Named import with different local identifier.
 */
type NamedImportSpecifier = string | { name: string; alias: string };

/**
 * Normalized import declaration for rendering.
 */
export type HandlerImportDeclarationRecord = {
  /**
   * Source module specifier.
   */
  source: string;
  /**
   * Local name for default import, if present.
   */
  defaultImport?: string;
  /**
   * Named imports from this source.
   */
  namedImports: Array<NamedImportSpecifier>;
};

/**
 * Writes one named import specifier, preserving aliases only when needed.
 *
 * @param writer - Writer receiving the generated syntax.
 * @param importSpecifier - Named import specifier to emit.
 */
const writeNamedImportSpecifier = (
  writer: Writer,
  importSpecifier: NamedImportSpecifier
): void => {
  if (isString(importSpecifier)) {
    writer.write(importSpecifier);
    return;
  }

  if (importSpecifier.name === importSpecifier.alias) {
    writer.write(importSpecifier.name);
    return;
  }

  writer.write(importSpecifier.name);
  writer.write(' as ');
  writer.write(importSpecifier.alias);
};

/**
 * Writes one import declaration in the generator's stable import layout.
 *
 * @param writer - Writer receiving the generated syntax.
 * @param importDeclaration - Normalized import declaration to emit.
 */
const writeImportDeclaration = (
  writer: Writer,
  importDeclaration: HandlerImportDeclarationRecord
): void => {
  const namedImports = importDeclaration.namedImports;

  writer.write('import ');

  if (importDeclaration.defaultImport) {
    writer.write(importDeclaration.defaultImport);
    if (namedImports.length > 0) {
      writer.write(', ');
    }
  }

  if (namedImports.length === 1) {
    const [onlyNamedImport] = namedImports;
    writer.write('{ ');
    writeNamedImportSpecifier(writer, onlyNamedImport);
    writer.write(' }');
  } else if (namedImports.length > 1) {
    writer.write('{');
    writer.newLine();
    writer.indent(() => {
      namedImports.forEach((namedImport, index) => {
        writeNamedImportSpecifier(writer, namedImport);
        if (index < namedImports.length - 1) {
          writer.write(',');
        }
        writer.newLine();
      });
    });
    writer.write('}');
  }

  writer.write(' from ');
  writeStringLiteral(writer, importDeclaration.source);
  writer.write(';');
};

/**
 * Renders the final import block exactly as it should appear in the generated
 * file.
 *
 * @param importDeclarations - Ordered import declarations to render.
 * @returns The rendered import block source.
 */
export const renderImportBlock = (
  importDeclarations: Array<HandlerImportDeclarationRecord>
): string => {
  const writer = createGeneratorWriter();

  importDeclarations.forEach((importDeclaration, index) => {
    writeImportDeclaration(writer, importDeclaration);
    if (index < importDeclarations.length - 1) {
      writer.newLine();
    }
  });

  return writer.toString();
};

/**
 * Groups raw component imports by module source so the emitter receives a
 * normalized import plan before any source text is written.
 *
 * @param componentImports - Raw component import records collected during module
 * preparation.
 * @returns Grouped import declarations ready for rendering.
 */
export const groupComponentImports = (
  componentImports: Array<HandlerComponentImportRecord>
): Array<HandlerImportDeclarationRecord> => {
  const groupedImports = new Map<string, HandlerImportDeclarationRecord>();

  for (const componentImport of componentImports) {
    let groupedImport = groupedImports.get(componentImport.source);
    if (groupedImport == null) {
      groupedImport = {
        source: componentImport.source,
        namedImports: []
      };
      groupedImports.set(componentImport.source, groupedImport);
    }

    if (componentImport.kind === 'default') {
      groupedImport.defaultImport = componentImport.alias;
      continue;
    }

    if (componentImport.importedName === componentImport.alias) {
      groupedImport.namedImports.push(componentImport.importedName);
      continue;
    }

    groupedImport.namedImports.push({
      name: componentImport.importedName,
      alias: componentImport.alias
    });
  }

  return [...groupedImports.values()];
};
