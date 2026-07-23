import type { Metadata } from 'next';
import type { TechArticle, WithContext } from 'schema-dts';

import { QuickStartPage } from '../../features/quick-start/QuickStartPage';
import { createJsonLdMarkup } from '../../lib/site/json-ld';
import {
  createSiteUrl,
  GITHUB_URL,
  QUICK_START_PATH,
  SITE_NAME
} from '../../lib/site/config';

const quickStartTitle = 'Quick Start';
const quickStartDescription =
  'Install next-slug-splitter, wrap your Next.js config, describe route targets, and verify broad catch-all routes with the live benchmark.';

export const metadata: Metadata = {
  title: quickStartTitle,
  description: quickStartDescription,
  alternates: {
    canonical: QUICK_START_PATH
  },
  openGraph: {
    url: QUICK_START_PATH,
    title: `${quickStartTitle} | ${SITE_NAME}`,
    description: quickStartDescription
  },
  twitter: {
    title: `${quickStartTitle} | ${SITE_NAME}`,
    description: quickStartDescription
  }
};

const quickStartStructuredData: WithContext<TechArticle> = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: `${SITE_NAME} ${quickStartTitle}`,
  description: quickStartDescription,
  url: createSiteUrl(QUICK_START_PATH),
  mainEntityOfPage: createSiteUrl(QUICK_START_PATH),
  about: {
    '@type': 'SoftwareSourceCode',
    codeRepository: GITHUB_URL
  }
};

export default function Page() {
  return (
    <>
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={createJsonLdMarkup(quickStartStructuredData)}
      />
      <QuickStartPage />
    </>
  );
}
