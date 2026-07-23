import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';

import { resolveSupportedLocale } from '../lib/locale-utils';
import { Shell } from '../lib/shell';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const locale = resolveSupportedLocale(router.locale);

  return (
    <Shell locale={locale}>
      <Component {...pageProps} />
    </Shell>
  );
}
