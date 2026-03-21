import {
  CodeBlockWriter,
  IndentationText,
  NewLineKind,
  Project,
  QuoteKind,
  type SourceFile,
  type WriterFunction
} from 'ts-morph';

import type { EmitFormat } from '../../core/types';
import { JsonValue } from '../../utils/type-guards-json';

/**
 * Type alias for the code block writer used in generators.
 */
export type Writer = CodeBlockWriter;

/**
 * Creates the in-memory source file used by generator emitters.
 *
 * @param emitFormat - Output module format that determines the generated file
 * extension.
 * @param baseName - Base filename for the generated source file, without the
 * extension.
 * @returns A formatted in-memory source file configured with the generator's
 * standard indentation, newline, and quote settings.
 */
export const createGeneratedSourceFile = (
  emitFormat: EmitFormat,
  baseName: string
): SourceFile => {
  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      newLineKind: NewLineKind.LineFeed,
      quoteKind: QuoteKind.Single
    }
  });

  const extension = emitFormat === 'ts' ? 'tsx' : 'js';
  return project.createSourceFile(`${baseName}.${extension}`, '', {
    overwrite: true
  });
};

/**
 * Writes one quoted string literal using the active writer's quote settings.
 *
 * @param writer - Writer receiving the generated syntax.
 * @param value - String value to emit as a quoted literal.
 * @returns Nothing. The writer is mutated in place.
 */
export const writeStringLiteral = (writer: Writer, value: string): void => {
  writer.quote(value);
};

/**
 * Writes an object property name as an identifier when possible, otherwise as a
 * quoted string literal.
 *
 * @param writer - Writer receiving the generated syntax.
 * @param value - Property name to emit.
 * @returns Nothing. The writer is mutated in place.
 */
export const writePropertyName = (writer: Writer, value: string): void => {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)) {
    writer.write(value);
    return;
  }

  writeStringLiteral(writer, value);
};

/**
 * Creates a writer initializer for a flat string array literal.
 *
 * @param values - Ordered string values to emit.
 * @returns A writer function that emits the array literal.
 */
export const createStringArrayInitializer = (
  values: Array<string>
): WriterFunction => {
  return writer => {
    writer.write('[');
    values.forEach((value, index) => {
      writeStringLiteral(writer, value);
      if (index < values.length - 1) {
        writer.write(',');
      }
    });
    writer.write(']');
  };
};

/**
 * Renders a compact string-array literal using the generator's standard writer
 * settings.
 *
 * @param values - Ordered string values to emit.
 * @returns The rendered array literal source.
 */
export const renderStringArrayLiteral = (values: Array<string>): string => {
  const writer = new CodeBlockWriter({
    indentNumberOfSpaces: 2,
    newLine: '\n',
    useSingleQuote: true
  });
  createStringArrayInitializer(values)(writer);
  return writer.toString();
};

/**
 * Creates a writer initializer for one JSON-like metadata value.
 *
 * Metadata values are emitted through `JSON.stringify(...)` because the
 * processor contract intentionally restricts them to JSON-compatible shapes.
 *
 * @param value - Metadata value to emit.
 * @returns A writer function that emits the serialized value.
 */
export const createSerializableValueInitializer = (
  value: JsonValue
): WriterFunction => {
  return writer => {
    writer.write(JSON.stringify(value));
  };
};
