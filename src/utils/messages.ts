/**
 * Shared package prefix used in user-facing logs and messages.
 */
export const NEXT_SLUG_SPLITTER_PREFIX = '[next-slug-splitter]';

/**
 * Prefix a message with the package identifier.
 *
 * @param message - Message body without prefix.
 * @returns Prefixed message ready for display.
 */
export const formatNextSlugSplitterMessage = (message: string): string =>
  `${NEXT_SLUG_SPLITTER_PREFIX} ${message}`;

/**
 * Prefix each line of a multi-line message with the package identifier.
 *
 * @param message - Message body that may span multiple lines.
 * @returns Message with every line individually prefixed.
 */
export const formatNextSlugSplitterMessageLines = (
  message: string
): string =>
  message
    .split('\n')
    .map(line => formatNextSlugSplitterMessage(line))
    .join('\n');
