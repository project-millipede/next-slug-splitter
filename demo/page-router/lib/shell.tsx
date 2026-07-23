import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

import { createHrefForLocale, type SupportedLocale } from './locale-utils';
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
 * Shared demo shell rendered by the custom Pages Router App component.
 *
 * 1. `_app.tsx` resolves the active locale from Next.js i18n routing.
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
        <Link
          href={createHrefForLocale(locale, '/')}
          locale={false}
          style={logoLinkStyle}
        >
          next-slug-splitter demo
        </Link>
        <LanguageSwitch activeLocale={locale} />
      </nav>
      {children}
    </div>
  );
}
