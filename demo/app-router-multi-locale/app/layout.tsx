/**
 * Root layout — `app/layout.tsx`
 *
 * Owns only the global document frame.
 *
 * The visible navigation shell lives in route-group and locale layouts so it
 * can receive the active locale from the layout layer that owns that route.
 */

import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Layout entry point
// ---------------------------------------------------------------------------

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang='en'>
      <body>{children}</body>
    </html>
  );
}
