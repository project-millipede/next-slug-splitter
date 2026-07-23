import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

import { createHrefForLocale, type SupportedLocale } from '../lib/locale-utils';

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
 * Minimal heavy-baseline shell.
 *
 * The baseline focuses on the docs route bundle shape, so the shell only keeps
 * the same localized navigation boundary as the splitter demo.
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
          next-slug-splitter heavy baseline
        </Link>
      </nav>
      {children}
    </div>
  );
}
