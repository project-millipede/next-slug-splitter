import type { GetStaticProps } from 'next';

import { HomePage } from '../lib/home-page';
import {
  resolveSupportedLocale,
  type SupportedLocale
} from '../lib/locale-utils';

type HomeProps = {
  locale: SupportedLocale;
};

export const getStaticProps: GetStaticProps<HomeProps> = async ctx => {
  return {
    props: {
      locale: resolveSupportedLocale(ctx.locale)
    }
  };
};

export default function Home({ locale }: HomeProps) {
  return <HomePage locale={locale} />;
}
