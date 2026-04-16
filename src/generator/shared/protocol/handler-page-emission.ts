/**
 * Shared syntax helpers for generated handler-page modules.
 *
 * @remarks
 * These helpers were extracted from the Pages Router emitter once App Router
 * adopted the same component-subset and handler-page factory contract. The
 * comments stay here so the explanation moves with the shared code, not the
 * old router-specific location.
 */
import type { WriterFunction } from 'ts-morph';
import type { JsonObject } from '../../../utils/type-guards-json';

import { toRoutePath } from '../../../core/discovery';
import { createGeneratorError } from '../../../utils/errors';
import { isNonEmptyString } from '../../../utils/type-guards-extended';
import {
  createSerializableValueInitializer,
  renderStringArrayLiteral,
  writePropertyName,
  type Writer
} from './emitter-utils';
import { writeExpressionArray } from './array-literal';

/**
 * Loadable component entry prepared for emission into a generated handler.
 */
export type HandlerLoadableComponentEmitEntry = {
  /**
   * Stable key of the component entry.
   */
  key: string;
  /**
   * Local alias for the component in the generated module.
   */
  componentAlias: string;
  /**
   * Inline metadata emitted alongside the component reference.
   */
  metadata: JsonObject;
};

/**
 * Writes one emitted loadable-registry entry object into the generated handler.
 *
 * The emitted shape is `component: <alias>` followed by any inline metadata
 * fields carried on the normalized entry.
 *
 * @param writer - Writer receiving the generated syntax.
 * @param entry - Loadable component entry data already normalized for emission.
 */
const writeComponentEntryObject = (
  writer: Writer,
  entry: HandlerLoadableComponentEmitEntry
): void => {
  const fieldWriters: Array<{ key: string; write: WriterFunction }> = [];

  if (!isNonEmptyString(entry.componentAlias)) {
    throw createGeneratorError(`Entry "${entry.key}" missing component alias.`);
  }

  fieldWriters.push({
    key: 'component',
    write: currentWriter => currentWriter.write(entry.componentAlias)
  });

  for (const [metadataKey, metadataValue] of Object.entries(entry.metadata)) {
    fieldWriters.push({
      key: metadataKey,
      write: currentWriter =>
        createSerializableValueInitializer(metadataValue)(currentWriter)
    });
  }

  writer.write('{');

  if (fieldWriters.length > 0) {
    writer.newLine();
    writer.indent(() => {
      fieldWriters.forEach((fieldWriter, index) => {
        writer.write(`${fieldWriter.key}: `);
        fieldWriter.write(writer);
        if (index < fieldWriters.length - 1) {
          writer.write(',');
        }
        writer.newLine();
      });
    });
  }

  writer.write('}');
};

/**
 * Creates the initializer for the emitted `loadableRegistrySubset` object.
 *
 * @param entries - Ordered loadable component entries selected for the handler.
 * @returns A writer function that emits the component subset object literal.
 */
const createComponentSubsetInitializer = (
  entries: Array<HandlerLoadableComponentEmitEntry>
): WriterFunction => {
  return writer => {
    writer.write('{');

    if (entries.length > 0) {
      writer.newLine();
      writer.indent(() => {
        entries.forEach((entry, index) => {
          writePropertyName(writer, entry.key);
          writer.write(': ');
          writeComponentEntryObject(writer, entry);
          if (index < entries.length - 1) {
            writer.write(',');
          }
          writer.newLine();
        });
      });
    }

    writer.write('}');
  };
};

/**
 * Creates the writer for optional route-level factory binding properties inside
 * the generated `createHandlerPage({...})` call.
 *
 * Example emitted block:
 * ```ts
 * primaryBinding: runtime,
 * helperBindings: [
 *   wrapperEnhancer,
 *   selectionEnhancer
 * ]
 * ```
 *
 * Responsibilities:
 * - write one property key/value pair for each factory binding
 * - choose between single-value and array-value emission
 * - insert `,` plus a newline only between sibling properties
 *
 * It intentionally does not write the leading separator from the previous
 * `loadableRegistrySubset` field. The caller owns that outer object-level
 * boundary.
 *
 * @param factoryBindingValues - Route-level binding aliases prepared for emission.
 * @returns A writer function that emits only the binding properties, without a
 * leading separator from the previous field.
 */
const createFactoryBindingPropertiesInitializer = (
  factoryBindingValues: Record<string, string | Array<string>>
): WriterFunction => {
  const factoryBindingEntries = Object.entries(factoryBindingValues);

  return writer => {
    factoryBindingEntries.forEach(
      ([factoryBindingKey, bindingValue], index) => {
        writePropertyName(writer, factoryBindingKey);
        writer.write(': ');

        if (Array.isArray(bindingValue)) {
          // Binding arrays contain imported identifier aliases, so they use the
          // expression-array writer rather than JSON-like value emission.
          writeExpressionArray(writer, bindingValue, { layout: 'multiline' });
        } else {
          // Single binding values are already resolved local aliases such as
          // `runtime`, so they can be written directly.
          writer.write(bindingValue);
        }

        if (index < factoryBindingEntries.length - 1) {
          // Separate sibling properties, but avoid a trailing comma after the
          // last emitted binding.
          writer.write(',');
          writer.newLine();
        }
      }
    );
  };
};

/**
 * Creates the initializer for the generated handler page instance.
 *
 * @param componentEntries - Ordered loadable component entries selected for the
 * handler.
 * @returns A writer function that emits the `createHandlerPage(...)` call.
 */
export const createHandlerPageInitializer = (
  componentEntries: Array<HandlerLoadableComponentEmitEntry>,
  factoryBindingValues: Record<string, string | Array<string>>
): WriterFunction => {
  const hasFactoryBindings = Object.keys(factoryBindingValues).length > 0;

  return writer => {
    writer.write('createHandlerPage({');
    writer.newLine();
    writer.indent(() => {
      writer.write('loadableRegistrySubset: ');
      createComponentSubsetInitializer(componentEntries)(writer);

      if (hasFactoryBindings) {
        writer.write(',');
        writer.newLine();
        createFactoryBindingPropertiesInitializer(factoryBindingValues)(writer);
      }

      writer.newLine();
    });
    writer.write('})');
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
export const createGeneratedHeaderLines = ({
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
}): Array<string> => [
  '// AUTO-GENERATED ROUTE HANDLER. DO NOT EDIT.',
  `// Source: /${sourceLocale}${toRoutePath(routeBasePath, sourceSlugArray)}`,
  `// Handler: ${handlerId}`,
  `// Used loadable keys: ${renderStringArrayLiteral(usedLoadableComponentKeys)}`
];
