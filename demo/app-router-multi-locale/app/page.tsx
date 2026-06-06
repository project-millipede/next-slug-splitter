import { DEFAULT_LOCALE } from '../lib/locale-utils';
import { HomePage } from './home-page';

/**
 * Render the default-locale homepage at `/`.
 */
export default function Home() {
  return <HomePage locale={DEFAULT_LOCALE} />;
}
