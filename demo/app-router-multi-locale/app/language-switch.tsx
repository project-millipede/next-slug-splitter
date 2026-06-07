'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CSSProperties } from 'react';

import {
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
 * Resolve the active page pathname needed by the language switch.
 *
 * Why this is pathname-based:
 * 1. The active locale is supplied by the layout that owns locale semantics.
 * 2. The active slug still comes from the browser-visible URL.
 * 3. The default locale is canonical without a visible locale segment:
 *    `/docs/a` means the default locale.
 * 4. Explicit locale URLs are still supported:
 *    `/en/docs/a` and `/de/docs/a`.
 *
 * Resolution rules:
 * 1. A leading supported locale segment is removed.
 * 2. Without a leading locale segment, the pathname is returned unchanged.
 * 3. The returned active pathname is locale-free so
 *    alternate language links can be created for the same page.
 *
 * @example
 * // Default locale, canonical URL
 * '/docs/a' -> '/docs/a'
 *
 * // Default locale, explicit URL
 * '/en/docs/a' -> '/docs/a'
 *
 * // Non-default locale
 * '/de/docs/a' -> '/docs/a'
 *
 * // Locale root
 * '/de' -> '/'
 *
 * @param pathname - Browser-visible pathname returned by `usePathname()`.
 * @returns Locale-free active page pathname used for language links.
 */
const resolveLanguageSwitchActivePathname = (pathname: string): string => {
  const pathSegments = pathname
    .split('/')
    .filter(segment => segment.length > 0);

  const [leadingPathSegment, ...remainingPathSegments] = pathSegments;

  if (leadingPathSegment != null && isSupportedLocale(leadingPathSegment)) {
    return `/${remainingPathSegments.join('/')}`;
  }

  return pathname || '/';
};

export function LanguageSwitch({
  activeLocale
}: {
  activeLocale: SupportedLocale;
}) {
  const pathname = usePathname() ?? '/';
  const activePathname = resolveLanguageSwitchActivePathname(pathname);

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
