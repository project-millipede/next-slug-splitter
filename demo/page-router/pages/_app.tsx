/**
 * Custom App component — `pages/_app.tsx`
 *
 * Wraps every page with a shared layout shell (centered container + nav).
 * This is the standard Next.js Pages Router pattern for applying global
 * layout without repeating markup in each page file.
 */

import Link from 'next/link';
import type { AppProps } from 'next/app';
import type { CSSProperties, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Layout styles
// ---------------------------------------------------------------------------

const containerStyle: CSSProperties = {
  maxWidth: '720px',
  margin: '0 auto',
  padding: '2rem',
  fontFamily: 'system-ui, sans-serif',
};

const navStyle: CSSProperties = {
  marginBottom: '2rem',
  paddingBottom: '1rem',
  borderBottom: '1px solid #e5e7eb',
};

const logoLinkStyle: CSSProperties = {
  fontWeight: 'bold',
  textDecoration: 'none',
  color: '#111',
};

// ---------------------------------------------------------------------------
// Navigation bar
// ---------------------------------------------------------------------------

function SiteNav() {
  return (
    <nav style={navStyle}>
      <Link href="/" style={logoLinkStyle}>
        next-slug-splitter demo
      </Link>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Page shell — centers content and renders the shared nav above each page
// ---------------------------------------------------------------------------

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div style={containerStyle}>
      <SiteNav />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

export default function App({ Component, pageProps }: AppProps) {
  return (
    <PageShell>
      <Component {...pageProps} />
    </PageShell>
  );
}
