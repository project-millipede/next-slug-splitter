import type { ReactNode } from 'react';

/**
 * Lightweight callout component provided through the MDX component scope.
 *
 * Pages may use `<Callout>` in MDX without becoming heavy because this component
 * is not emitted as a generated handler import.
 */
export type CalloutProps = {
  children?: ReactNode;
};

export const Callout = ({ children }: CalloutProps) => (
  <aside
    style={{
      margin: '1rem 0',
      borderLeft: '4px solid #2563eb',
      padding: '0.75rem 1rem',
      background: '#eff6ff'
    }}
  >
    {children}
  </aside>
);
