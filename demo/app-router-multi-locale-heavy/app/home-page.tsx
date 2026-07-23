import Link from 'next/link';
import type { CSSProperties } from 'react';

import { createHrefForLocale, type SupportedLocale } from '../lib/locale-utils';

const listStyle: CSSProperties = {
  display: 'grid',
  gap: '0.75rem',
  paddingLeft: '1.25rem'
};

const docs = ['getting-started', 'tutorial', 'interactive', 'dashboard'];

/**
 * Render the small heavy-baseline docs index page for the active locale.
 */
export function HomePage({ locale }: { locale: SupportedLocale }) {
  return (
    <main>
      <h1>Heavy baseline demo</h1>
      <p>
        Every docs route uses one authored page with the full loadable component
        registry.
      </p>
      <ul style={listStyle}>
        {docs.map(slug => (
          <li key={slug}>
            <Link href={createHrefForLocale(locale, `/docs/${slug}`)}>
              {slug}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
