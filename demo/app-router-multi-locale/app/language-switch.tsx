'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CSSProperties } from 'react';

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  createHrefForLocale,
  isSupportedLocale,
  type SupportedLocale
} from '../lib/locale-utils';

const switchStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.375rem',
  fontSize: '0.875rem'
};

const linkStyle = (active: boolean): CSSProperties => ({
  color: active ? '#111827' : '#4b5563',
  fontWeight: active ? 700 : 500,
  textDecoration: active ? 'underline' : 'none',
  textUnderlineOffset: '0.2rem'
});

const separatorStyle: CSSProperties = {
  color: '#9ca3af'
};

/**
 * Resolve the browser-path state needed by the language switch.
 *
 * Why this is pathname-based:
 * 1. The switch is rendered from `app/layout.tsx`, above the `[locale]` route
 *    segment, so it does not receive child route params.
 * 2. The default locale is canonical without a visible locale segment:
 *    `/docs/a` means the default locale.
 * 3. Explicit locale URLs are still supported:
 *    `/en/docs/a` and `/de/docs/a`.
 *
 * Resolution rules:
 * 1. A leading supported locale segment becomes the active locale.
 * 2. Without a leading locale segment, the active locale is the default locale.
 * 3. The returned active pathname removes any leading locale segment so
 *    alternate language links can be created for the same page.
 *
 * @example
 * // Default locale, canonical URL
 * '/docs/a' -> { locale: 'en', activePathname: '/docs/a' }
 *
 * // Default locale, explicit URL
 * '/en/docs/a' -> { locale: 'en', activePathname: '/docs/a' }
 *
 * // Non-default locale
 * '/de/docs/a' -> { locale: 'de', activePathname: '/docs/a' }
 *
 * // Locale root
 * '/de' -> { locale: 'de', activePathname: '/' }
 *
 * @param pathname - Browser-visible pathname returned by `usePathname()`.
 * @returns Active locale plus the active page pathname used for language links.
 */
const resolveLanguageSwitchPathState = (
  pathname: string
): {
  locale: SupportedLocale;
  activePathname: string;
} => {
  const pathSegments = pathname
    .split('/')
    .filter(segment => segment.length > 0);

  const [leadingPathSegment, ...remainingPathSegments] = pathSegments;

  if (leadingPathSegment != null && isSupportedLocale(leadingPathSegment)) {
    const activePathname = `/${remainingPathSegments.join('/')}`;

    return {
      locale: leadingPathSegment,
      activePathname
    };
  }

  return {
    locale: DEFAULT_LOCALE,
    activePathname: pathname || '/'
  };
};

export function LanguageSwitch() {
  const pathname = usePathname() ?? '/';
  const { locale: activeLocale, activePathname } =
    resolveLanguageSwitchPathState(pathname);

  return (
    <div aria-label='Language switch' style={switchStyle}>
      {SUPPORTED_LOCALES.map((locale, index) => (
        <span key={locale}>
          {index > 0 ? <span style={separatorStyle}>/ </span> : null}
          <Link
            aria-current={locale === activeLocale ? 'page' : undefined}
            href={createHrefForLocale(locale, activePathname)}
            style={linkStyle(locale === activeLocale)}
          >
            {locale.toUpperCase()}
          </Link>
        </span>
      ))}
    </div>
  );
}
