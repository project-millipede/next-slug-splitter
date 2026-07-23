import { createFromSource } from 'fumadocs-core/search/server';

import { source } from '../../../lib/source';

/**
 * Provide the server-side search endpoint used by the Fumadocs search UI.
 *
 * 1. `source` supplies the normalized documentation pages.
 * 2. Fumadocs builds and searches its index from those pages.
 * 3. Next.js exposes the exported handler at `/api/search`.
 */
export const { GET } = createFromSource(source);
