import type { Metadata } from 'next';
import type { WebApplication, WithContext } from 'schema-dts';

import { BenchmarkApp } from '../../features/benchmark/BenchmarkApp';
import { createJsonLdMarkup } from '../../lib/site/json-ld';
import {
  BENCHMARK_PATH,
  createSiteUrl,
  SITE_NAME
} from '../../lib/site/config';

const benchmarkTitle = 'Live Benchmark';
const benchmarkDescription =
  'Compare encoded JavaScript size, decoded JavaScript size, and load duration with and without route splitting.';

export const metadata: Metadata = {
  title: benchmarkTitle,
  description: benchmarkDescription,
  alternates: {
    canonical: BENCHMARK_PATH
  },
  openGraph: {
    url: BENCHMARK_PATH,
    title: `${benchmarkTitle} | ${SITE_NAME}`,
    description: benchmarkDescription
  },
  twitter: {
    title: `${benchmarkTitle} | ${SITE_NAME}`,
    description: benchmarkDescription
  }
};

const benchmarkStructuredData: WithContext<WebApplication> = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: benchmarkTitle,
  description: benchmarkDescription,
  applicationCategory: 'DeveloperApplication',
  url: createSiteUrl(BENCHMARK_PATH)
};

/**
 * Next.js route-segment config: render the benchmark page on every request.
 *
 * The benchmark UI depends on current target origins and fresh no-store
 * route handlers, so it should not be treated as a prerendered static page.
 */
export const dynamic = 'force-dynamic';
/**
 * Next.js route-segment config: disable ISR caching for this page.
 *
 * `force-dynamic` is the primary signal; `revalidate = 0` makes the no-static
 * caching intent explicit for the page segment.
 */
export const revalidate = 0;

export default function Page() {
  return (
    <>
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={createJsonLdMarkup(benchmarkStructuredData)}
      />
      <BenchmarkApp />
    </>
  );
}
