import type { Metadata } from 'next';
import type {
  SoftwareSourceCode,
  WebApplication,
  WebSite,
  WithContext
} from 'schema-dts';

import { LandingPage } from '../features/landing/LandingPage';
import { createJsonLdMarkup } from '../lib/site/json-ld';
import {
  BENCHMARK_PATH,
  createSiteUrl,
  GITHUB_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE
} from '../lib/site/config';

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: '/'
  },
  openGraph: {
    url: '/',
    title: `${SITE_NAME} | ${SITE_TITLE}`,
    description: SITE_DESCRIPTION
  },
  twitter: {
    title: `${SITE_NAME} | ${SITE_TITLE}`,
    description: SITE_DESCRIPTION
  }
};

const landingStructuredData: Array<
  | WithContext<SoftwareSourceCode>
  | WithContext<WebApplication>
  | WithContext<WebSite>
> = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: createSiteUrl('/'),
    description: SITE_DESCRIPTION
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    codeRepository: GITHUB_URL,
    programmingLanguage: ['TypeScript', 'JavaScript'],
    runtimePlatform: 'Next.js',
    url: createSiteUrl('/')
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Live Benchmark',
    description:
      'Compare route-specific splitter chunks against heavy Next.js baseline routes.',
    applicationCategory: 'DeveloperApplication',
    url: createSiteUrl(BENCHMARK_PATH)
  }
];

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={createJsonLdMarkup(landingStructuredData)}
      />
      <LandingPage />
    </>
  );
}
