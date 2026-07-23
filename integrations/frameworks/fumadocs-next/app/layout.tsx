import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';

import './styles.css';

export const metadata = {
  title: 'Fumadocs Splitter Integration'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
