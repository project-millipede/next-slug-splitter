import { notFound } from 'next/navigation';

import { HomePage } from '../home-page';
import {
  SUPPORTED_LOCALES,
  resolveSupportedLocale
} from '../../lib/locale-utils';

type LocaleHomeParams = {
  locale: string;
};

export const dynamicParams = false;

export const generateStaticParams = () =>
  SUPPORTED_LOCALES.map(locale => ({
    locale
  }));

export default async function LocaleHome({
  params
}: {
  params: Promise<LocaleHomeParams>;
}) {
  const { locale } = await params;
  const resolvedLocale = resolveSupportedLocale(locale);

  if (resolvedLocale !== locale) {
    notFound();
  }

  return <HomePage locale={resolvedLocale} />;
}
