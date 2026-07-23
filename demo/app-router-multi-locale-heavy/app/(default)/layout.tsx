import type { ReactNode } from 'react';

import { DEFAULT_LOCALE } from '../../lib/locale-utils';
import { Shell } from '../shell';

export default function DefaultLocaleLayout({
  children
}: {
  children: ReactNode;
}) {
  return <Shell locale={DEFAULT_LOCALE}>{children}</Shell>;
}
