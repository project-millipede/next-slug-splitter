import type { GetStaticProps } from 'next';

import { HomePage } from '../lib/home-page';
import {
  resolveSupportedLocale,
  type SupportedLocale
} from '../lib/locale-utils';

/** Props for the localized Pages Router homepage. */
type HomeProps = {
  /** Locale resolved from Next.js Pages Router i18n routing. */
  locale: SupportedLocale;
};

/**
 * Resolve the locale for the statically generated homepage.
 *
 * @param ctx - Next.js static-props context for the current locale route.
 * @returns Static homepage props containing the supported locale.
 */
export const getStaticProps: GetStaticProps<HomeProps> = async ctx => {
  return {
    props: {
      locale: resolveSupportedLocale(ctx.locale)
    }
  };
};

/**
 * Render the localized Pages Router homepage.
 */
export default function Home({ locale }: HomeProps) {
  return <HomePage locale={locale} />;
}
