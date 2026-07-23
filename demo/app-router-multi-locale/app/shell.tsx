import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

import { createHrefForLocale, type SupportedLocale } from '../lib/locale-utils';
import { LanguageSwitch } from './language-switch';

const containerStyle: CSSProperties = {
  maxWidth: '720px',
  margin: '0 auto',
  padding: '2rem',
  fontFamily: 'system-ui, sans-serif'
};

const navStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1rem',
  marginBottom: '2rem',
  paddingBottom: '1rem',
  borderBottom: '1px solid #e5e7eb'
};

const logoLinkStyle: CSSProperties = {
  fontWeight: 'bold',
  textDecoration: 'none',
  color: '#111'
};

/**
 * Shared demo shell rendered only from App Router layout files.
 *
 * 1. Layouts pass the active locale structurally.
 * 2. The logo link returns to the homepage for that locale.
 * 3. The language switch preserves the current browser-visible slug.
 */
export function Shell({
  locale,
  children
}: {
  locale: SupportedLocale;
  children: ReactNode;
}) {
  return (
    <div style={containerStyle}>
      <nav style={navStyle}>
        <Link href={createHrefForLocale(locale, '/')} style={logoLinkStyle}>
          next-slug-splitter demo
        </Link>
        <LanguageSwitch activeLocale={locale} />
      </nav>
      {children}
    </div>
  );
}
