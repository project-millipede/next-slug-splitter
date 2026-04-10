import {
  CodeBlockWriter,
  IndentationText,
  NewLineKind,
  Project,
  QuoteKind,
  type SourceFile,
  type WriterFunction
} from 'ts-morph';

import type { EmitFormat } from '../../../core/types';
import { isString } from '../../../utils/type-guards';
import { JsonValue } from '../../../utils/type-guards-json';
import {
  type ArrayLiteralWriteOptions,
  writeStringArray
} from './array-literal';

/**
 * Type alias for the code block writer used in generators.
 */
export type Writer = CodeBlockWriter;

/**
 * Shared writer settings for standalone generator render helpers.
 *
 * These match the project-wide generator style:
 * - two-space indentation
 * - LF newlines
 * - single-quoted string literals
 */
const generatorWriterOptions = {
  indentNumberOfSpaces: 2,
  newLine: '\n',
  useSingleQuote: true
} as const;

/**
 * Creates a standalone writer using the generator's standard formatting
 * settings.
 *
 * Use this only when a render helper needs its own writer instance. Nested
 * emitters should keep using the writer they were given so indentation stays
 * relative to the current emission context.
 */
export const createGeneratorWriter = (): Writer =>
  new CodeBlockWriter(generatorWriterOptions);

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
 * Renders a string-array literal using the generator's standard writer
 * settings.
 *
 * By default this preserves the compact form:
 * `['first','second']`.
 *
 * @param values - Ordered string values to emit.
 * @param options - Layout controls for the emitted array.
 * @returns The rendered array literal source.
 */
export const renderStringArrayLiteral = (
  values: Array<string>,
  options: ArrayLiteralWriteOptions = {}
): string => {
  const writer = createGeneratorWriter();
  writeStringArray(writer, values, options);
  return writer.toString();
};

/**
 * Creates a writer initializer for one JSON-like metadata value.
 *
 * Metadata values are generally emitted through `JSON.stringify(...)` because
 * the processor contract intentionally restricts them to JSON-compatible
 * shapes.
 *
 * String arrays are the one formatting-oriented special case handled through
 * the writer directly so metadata arrays can follow the same multiline array
 * layout used by route-level expression arrays when desired.
 *
 * @param value - Metadata value to emit.
 * @returns A writer function that emits the serialized value.
 */
export const createSerializableValueInitializer = (
  value: JsonValue
): WriterFunction => {
  return writer => {
    if (Array.isArray(value) && value.every(isString)) {
      writeStringArray(writer, value, { layout: 'multiline' });
      return;
    }

    writer.write(JSON.stringify(value));
  };
};
