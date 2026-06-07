import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import {
  resolveSupportedLocale,
  type SupportedLocale
} from '../../lib/locale-utils';
import { Shell } from '../shell';

type LocaleLayoutParams = {
  locale: string;
};

/**
 * Locale-owned shell layout for routes below `app/[locale]`.
 *
 * 1. The navigation shell stays layout-owned.
 * 2. The locale is read from the physical `[locale]` route segment.
 * 3. Light docs pages and generated heavy handler pages both inherit this
 *    layout because they live below `app/[locale]`.
 */
export default async function LocaleLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<LocaleLayoutParams>;
}) {
  const { locale } = await params;
  const resolvedLocale: SupportedLocale = resolveSupportedLocale(locale);

  if (resolvedLocale !== locale) {
    notFound();
  }

  return <Shell locale={resolvedLocale}>{children}</Shell>;
}
