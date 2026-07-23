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
