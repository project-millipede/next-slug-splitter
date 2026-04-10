import type { Writer } from './emitter-utils';

/**
 * Available layout modes for emitted array literals.
 *
 * - `compact` keeps all items on one line.
 * - `multiline` emits one item per line, indented from the current writer
 *   depth.
 */
export type ArrayLiteralLayout = 'compact' | 'multiline';

/**
 * Shared options controlling array-literal layout.
 */
export type ArrayLiteralWriteOptions = {
  /**
   * Whether the array should stay on one line or expand to one item per line.
   *
   * Defaults to `compact`.
   */
  layout?: ArrayLiteralLayout;

  /**
   * Separator used between compact items.
   *
   * This allows compact string arrays to preserve the generator's current
   * `['a','b']` style while expression arrays can still choose `[a, b]`.
   */
  compactSeparator?: string;
};

/**
 * Writes an array literal using either compact or multiline layout.
 *
 * Examples:
 * - compact: `['wrapper','selection']`
 * - multiline:
 *   `[
 *     wrapperEnhancer,
 *     selectionEnhancer
 *   ]`
 *
 * @param writer - Writer receiving the generated syntax.
 * @param values - Ordered values to emit.
 * @param writeItem - Callback that writes one array item.
 * @param options - Layout controls for the emitted array.
 */
const writeArrayLiteral = <T>(
  writer: Writer,
  values: ReadonlyArray<T>,
  writeItem: (writer: Writer, value: T) => void,
  options: ArrayLiteralWriteOptions = {}
): void => {
  const { layout = 'compact', compactSeparator = ',' } = options;

  writer.write('[');

  if (layout === 'compact') {
    values.forEach((value, index) => {
      writeItem(writer, value);
      if (index < values.length - 1) {
        writer.write(compactSeparator);
      }
    });
    writer.write(']');
    return;
  }

  if (values.length > 0) {
    writer.newLine();
    writer.indent(() => {
      values.forEach((value, index) => {
        writeItem(writer, value);
        if (index < values.length - 1) {
          writer.write(',');
        }
        writer.newLine();
      });
    });
  }

  writer.write(']');
};

/**
 * Writes an array of quoted string literals using the requested layout.
 *
 * Example output:
 * - compact: `['first','second']`
 * - multiline:
 *   `[
 *     'first',
 *     'second'
 *   ]`
 *
 * @param writer - Writer receiving the generated syntax.
 * @param values - Ordered string values to emit.
 * @param options - Layout controls for the emitted array.
 */
export const writeStringArray = (
  writer: Writer,
  values: Array<string>,
  options: ArrayLiteralWriteOptions = {}
): void => {
  writeArrayLiteral(
    writer,
    values,
    (currentWriter, value) => {
      currentWriter.quote(value);
    },
    {
      compactSeparator: ',',
      ...options
    }
  );
};

/**
 * Writes an array of identifier expressions using the requested layout.
 *
 * Example output:
 * - compact: `[wrapperEnhancer, selectionEnhancer]`
 * - multiline:
 *   `[
 *     wrapperEnhancer,
 *     selectionEnhancer
 *   ]`
 *
 * @param writer - Writer receiving the generated syntax.
 * @param values - Ordered identifier expressions to emit.
 * @param options - Layout controls for the emitted array.
 */
export const writeExpressionArray = (
  writer: Writer,
  values: Array<string>,
  options: ArrayLiteralWriteOptions = {}
): void => {
  writeArrayLiteral(
    writer,
    values,
    (currentWriter, value) => {
      currentWriter.write(value);
    },
    {
      compactSeparator: ', ',
      ...options
    }
  );
};
