import type { Thing, WithContext } from 'schema-dts';

/**
 * Serialize JSON-LD in a form safe to place inside a script tag.
 *
 * @param schema - Typed schema.org structured data object or array of objects.
 * @returns React `dangerouslySetInnerHTML` payload for JSON-LD scripts.
 */
export const createJsonLdMarkup = (
  schema: WithContext<Thing> | Array<WithContext<Thing>>
): {
  __html: string;
} => ({
  __html: JSON.stringify(schema).replace(/</g, '\\u003c')
});
