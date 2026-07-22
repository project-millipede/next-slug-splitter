import type { ReactNode } from 'react';

import styles from './styles.module.css';

/**
 * Lightweight callout component provided through the MDX component scope.
 *
 * Pages may use `<Callout>` in MDX without becoming heavy because this
 * component is not emitted as a generated handler import.
 */
export type CalloutProps = {
  children?: ReactNode;
};

export const Callout = ({ children }: CalloutProps) => (
  <aside className={styles.callout} role='note'>
    {children}
  </aside>
);
