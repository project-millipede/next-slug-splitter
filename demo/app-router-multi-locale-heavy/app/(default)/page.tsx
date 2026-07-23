import { DEFAULT_LOCALE } from '../../lib/locale-utils';
import { HomePage } from '../home-page';

export default function Home() {
  return <HomePage locale={DEFAULT_LOCALE} />;
}
