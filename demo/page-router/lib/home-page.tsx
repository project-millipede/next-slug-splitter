/**
 * Shared homepage body for the Pages Router multi-locale demo.
 *
 * Both the default-locale route and explicit locale routes render this
 * component with a locale prop resolved from Next.js Pages Router i18n.
 */

import type { CSSProperties } from 'react';
import Link from 'next/link';

import {
  DEFAULT_LOCALE,
  createHrefForLocale,
  type SupportedLocale
} from './locale-utils';

// ---------------------------------------------------------------------------
// Page data
// ---------------------------------------------------------------------------

/** Routing classification used by the demo content pages. */
type PageKind = 'light' | 'heavy';

/** One docs page shown on the localized homepage. */
type PageEntry = {
  /** URL segment under `/docs/`. */
  slug: string;
  /**
   * Routing classification: light pages use the authored catch-all, while
   * heavy pages are served by generated handlers.
   */
  kind: PageKind;
};

const pages: PageEntry[] = [
  {
    slug: 'getting-started',
    kind: 'light'
  },
  {
    slug: 'tutorial',
    kind: 'light'
  },
  {
    slug: 'interactive',
    kind: 'heavy'
  },
  {
    slug: 'dashboard',
    kind: 'heavy'
  }
];

/** Localized homepage copy keyed by the active demo locale. */
const homeContentByLocale: Record<
  SupportedLocale,
  {
    heading: string;
    introBeforePackage: string;
    introAfterPackage: string;
    pagesHeading: string;
    howItWorksHeading: string;
    lightDescription: string;
    heavyDescription: string;
    entries: Record<string, { title: string; description: string }>;
  }
> = {
  en: {
    heading: 'next-slug-splitter Demo',
    introBeforePackage: 'This minimal Next.js app demonstrates how ',
    introAfterPackage:
      ' separates light and heavy MDX pages into optimized route handlers.',
    pagesHeading: 'Pages',
    howItWorksHeading: 'How it works',
    lightDescription:
      'Light pages are served by the locale-aware catch-all pages/docs/[...slug].tsx backed by one shared route module.',
    heavyDescription:
      'Heavy pages get auto-generated handlers in pages/docs/generated-handlers/ that import only the components they need.',
    entries: {
      'getting-started': {
        title: 'Getting Started',
        description: 'Pure Markdown — no custom React components'
      },
      tutorial: {
        title: 'Tutorial',
        description: 'Uses <Callout /> from the MDX component scope'
      },
      interactive: {
        title: 'Interactive Demo',
        description:
          'Uses <ExamplePreview /> — an interactive preview component'
      },
      dashboard: {
        title: 'Dashboard',
        description:
          'Uses <FlowComposer /> and <ComponentWorkbench /> — multiple heavy components'
      }
    }
  },
  de: {
    heading: 'next-slug-splitter Demo',
    introBeforePackage: 'Diese minimale Next.js-App zeigt, wie ',
    introAfterPackage:
      ' leichte und schwere MDX-Seiten in optimierte Route Handler aufteilt.',
    pagesHeading: 'Seiten',
    howItWorksHeading: 'So funktioniert es',
    lightDescription:
      'Leichte Seiten laufen über die locale-bewusste Catch-all-Route pages/docs/[...slug].tsx mit einem gemeinsamen Route-Modul.',
    heavyDescription:
      'Schwere Seiten bekommen automatisch generierte Handler in pages/docs/generated-handlers/, die nur die benötigten Komponenten importieren.',
    entries: {
      'getting-started': {
        title: 'Erste Schritte',
        description: 'Reines Markdown — keine eigenen React-Komponenten'
      },
      tutorial: {
        title: 'Tutorial',
        description: 'Nutzt <Callout /> aus dem MDX-Komponenten-Scope'
      },
      interactive: {
        title: 'Interaktive Demo',
        description:
          'Nutzt <ExamplePreview /> — eine interaktive Vorschau-Komponente'
      },
      dashboard: {
        title: 'Dashboard',
        description:
          'Nutzt <FlowComposer /> und <ComponentWorkbench /> — mehrere schwere Komponenten'
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const kindColors: Record<
  PageKind,
  { border: string; bg: string; text: string }
> = {
  light: { border: '#d1d5db', bg: '#f3f4f6', text: '#6b7280' },
  heavy: { border: '#f59e0b', bg: '#fef3c7', text: '#92400e' }
};

/**
 * Build the card style for one page entry.
 *
 * @param kind - Routing classification for the page.
 * @returns Inline styles for the page card link.
 */
const cardStyle = (kind: PageKind): CSSProperties => ({
  display: 'block',
  padding: '1rem',
  border: `2px solid ${kindColors[kind].border}`,
  borderRadius: '0.5rem',
  textDecoration: 'none',
  color: 'inherit'
});

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem'
};

/**
 * Build the pill badge style for one routing classification.
 *
 * @param kind - Routing classification for the page.
 * @returns Inline styles for the light/heavy badge.
 */
const badgeStyle = (kind: PageKind): CSSProperties => ({
  fontSize: '0.75rem',
  padding: '0.125rem 0.5rem',
  borderRadius: '9999px',
  background: kindColors[kind].bg,
  color: kindColors[kind].text
});

const descriptionStyle: CSSProperties = {
  margin: '0.25rem 0 0',
  fontSize: '0.875rem',
  color: '#6b7280'
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gap: '1rem'
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * Render a badge showing a page's light or heavy routing classification.
 */
function KindBadge({ kind }: { kind: PageKind }) {
  return <span style={badgeStyle(kind)}>{kind}</span>;
}

/**
 * Render a card linking to one localized docs page.
 */
function PageCard({
  locale,
  page
}: {
  locale: SupportedLocale;
  page: PageEntry;
}) {
  const entryContent = homeContentByLocale[locale].entries[page.slug];

  return (
    <Link
      href={createHrefForLocale(locale, `/docs/${page.slug}`)}
      locale={false}
      prefetch={false}
      style={cardStyle(page.kind)}
    >
      <div style={cardHeaderStyle}>
        <strong>{entryContent.title}</strong>
        <KindBadge kind={page.kind} />
      </div>
      <p style={descriptionStyle}>{entryContent.description}</p>
    </Link>
  );
}

/**
 * Render the localized grid of all demo content page cards.
 */
function PageList({ locale }: { locale: SupportedLocale }) {
  return (
    <div style={gridStyle}>
      {pages.map(page => (
        <PageCard key={page.slug} locale={locale} page={page} />
      ))}
    </div>
  );
}

/**
 * Render the localized explanation of light and heavy route handling.
 */
function HowItWorks({ locale }: { locale: SupportedLocale }) {
  const content = homeContentByLocale[locale];

  return (
    <>
      <h2 style={{ marginTop: '2rem' }}>{content.howItWorksHeading}</h2>
      <ul>
        <li>
          <strong>Light pages</strong> — {content.lightDescription}
        </li>
        <li>
          <strong>Heavy pages</strong> — {content.heavyDescription}
        </li>
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

/**
 * Render the localized homepage body for the Pages Router demo.
 */
export function HomePage({
  locale = DEFAULT_LOCALE
}: {
  locale?: SupportedLocale;
}) {
  const content = homeContentByLocale[locale];

  return (
    <>
      <h1>{content.heading}</h1>
      <p>
        {content.introBeforePackage}
        <strong>next-slug-splitter</strong>
        {content.introAfterPackage}
      </p>
      <h2>{content.pagesHeading}</h2>
      <PageList locale={locale} />
      <HowItWorks locale={locale} />
    </>
  );
}
