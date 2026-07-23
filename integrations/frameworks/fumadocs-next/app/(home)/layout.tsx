import type { ReactNode } from 'react';
import { HomeLayout } from 'fumadocs-ui/layouts/home';

import { baseLayoutOptions } from '../../lib/layout.shared';

/**
 * Render the standard Fumadocs home layout around the integration homepage.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return <HomeLayout {...baseLayoutOptions}>{children}</HomeLayout>;
}
