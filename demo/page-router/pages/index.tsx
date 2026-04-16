/**
 * Home page — `pages/index.tsx`
 *
 * Landing page for the next-slug-splitter demo. Lists all available content
 * pages with their routing classification (light vs heavy) so the difference
 * in bundle behavior is immediately visible.
 */

import type { CSSProperties } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Page data
// ---------------------------------------------------------------------------

type PageKind = 'light' | 'heavy';

type PageEntry = {
  /** URL segment under `/docs/` */
  slug: string;
  /** Human-readable page title */
  title: string;
  /** Routing classification — light pages use the catch-all, heavy pages
   *  are served by auto-generated handlers */
  kind: PageKind;
  /** Short explanation of why the page is light or heavy */
  description: string;
};

const pages: PageEntry[] = [
  {
    slug: 'getting-started',
    title: 'Getting Started',
    kind: 'light',
    description: 'Pure Markdown — no custom React components',
  },
  {
    slug: 'tutorial',
    title: 'Tutorial',
    kind: 'light',
    description: 'Pure Markdown — no custom React components',
  },
  {
    slug: 'interactive',
    title: 'Interactive Demo',
    kind: 'heavy',
    description: 'Uses <Counter /> — a stateful React component',
  },
  {
    slug: 'dashboard',
    title: 'Dashboard',
    kind: 'heavy',
    description: 'Uses <Chart /> and <DataTable /> — multiple heavy components',
  },
];

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const kindColors: Record<PageKind, { border: string; bg: string; text: string }> = {
  light: { border: '#d1d5db', bg: '#f3f4f6', text: '#6b7280' },
  heavy: { border: '#f59e0b', bg: '#fef3c7', text: '#92400e' },
};

const cardStyle = (kind: PageKind): CSSProperties => ({
  display: 'block',
  padding: '1rem',
  border: `2px solid ${kindColors[kind].border}`,
  borderRadius: '0.5rem',
  textDecoration: 'none',
  color: 'inherit',
});

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
};

const badgeStyle = (kind: PageKind): CSSProperties => ({
  fontSize: '0.75rem',
  padding: '0.125rem 0.5rem',
  borderRadius: '9999px',
  background: kindColors[kind].bg,
  color: kindColors[kind].text,
});

const descriptionStyle: CSSProperties = {
  margin: '0.25rem 0 0',
  fontSize: '0.875rem',
  color: '#6b7280',
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gap: '1rem',
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** Badge that shows the routing classification of a page */
function KindBadge({ kind }: { kind: PageKind }) {
  return <span style={badgeStyle(kind)}>{kind}</span>;
}

/** Card linking to one content page with its title, kind, and description */
function PageCard({ page }: { page: PageEntry }) {
  return (
    <Link
      href={`/docs/${page.slug}`}
      // In the Pages Router, `prefetch={false}` disables viewport prefetching
      // but Next still prefetches on hover by default.
      prefetch={false}
      style={cardStyle(page.kind)}
    >
      <div style={cardHeaderStyle}>
        <strong>{page.title}</strong>
        <KindBadge kind={page.kind} />
      </div>
      <p style={descriptionStyle}>{page.description}</p>
    </Link>
  );
}

/** Grid of all content page cards */
function PageList() {
  return (
    <div style={gridStyle}>
      {pages.map(page => (
        <PageCard key={page.slug} page={page} />
      ))}
    </div>
  );
}

/** Explanation of how light and heavy pages are routed */
function HowItWorks() {
  return (
    <>
      <h2 style={{ marginTop: '2rem' }}>How it works</h2>
      <ul>
        <li>
          <strong>Light pages</strong> are served by the catch-all{' '}
          <code>pages/docs/[...slug].tsx</code> — they never bundle heavy
          component code.
        </li>
        <li>
          <strong>Heavy pages</strong> get auto-generated handlers in{' '}
          <code>pages/docs/_handlers/</code> that import only the components
          they need.
        </li>
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page entry point
// ---------------------------------------------------------------------------

export default function Home() {
  return (
    <>
      <h1>next-slug-splitter Demo</h1>
      <p>
        This minimal Next.js app demonstrates how{' '}
        <strong>next-slug-splitter</strong> separates light and heavy MDX pages
        into optimized route handlers.
      </p>
      <h2>Pages</h2>
      <PageList />
      <HowItWorks />
    </>
  );
}
