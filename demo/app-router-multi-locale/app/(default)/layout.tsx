import type { ReactNode } from 'react';

import { DEFAULT_LOCALE } from '../../lib/locale-utils';
import { Shell } from '../shell';

/**
 * Default-locale shell layout for the invisible `(default)` route group.
 *
 * 1. `/` is the canonical homepage for the default locale, but it is not
 *    physically below `app/[locale]`.
 * 2. Because `/` has no `[locale]` route segment, it cannot receive
 *    `params.locale` from `app/[locale]/layout.tsx`.
 * 3. This sibling layout keeps the shared navigation layout-owned for `/` and
 *    provides `DEFAULT_LOCALE` structurally.
 * 4. Locale-prefixed routes stay owned by `app/[locale]/layout.tsx`.
 */
export default function DefaultLocaleLayout({
  children
}: {
  children: ReactNode;
}) {
  return <Shell locale={DEFAULT_LOCALE}>{children}</Shell>;
}
