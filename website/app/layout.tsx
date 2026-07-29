import type { Metadata } from 'next';
import { GoogleAnalytics } from '@next/third-parties/google';
import type { ReactNode } from 'react';

import {
  GITHUB_URL,
  GOOGLE_ANALYTICS_ID,
  OPENGRAPH_IMAGE_PATH,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
  TWITTER_IMAGE_PATH
} from '../lib/site/config';
import { SiteFooter } from './SiteFooter';
import { SiteNav } from './SiteNav';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: `${SITE_NAME} | ${SITE_TITLE}`,
    template: `%s | ${SITE_NAME}`
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'Next.js route splitting',
    'Next.js route splitting plugin',
    'Next.js configuration for route splitting',
    'Next.js adapterPath integration',
    'Next.js rewrites for generated routes',
    'App Router catch-all route splitting',
    'Pages Router catch-all route splitting',
    'catch-all routes without catch-all bundles',
    'dynamic routes with smaller bundles',
    'route handlers generated at build time',
    'route generation for content pages',
    'locale routing for Next.js',
    'route splitting for page-specific bundles',
    'bundle splitting for catch-all routes',
    'code splitting for Next.js routes',
    'bundle optimization for Next.js',
    'tree shaking for route bundles',
    'next/dynamic and route boundaries',
    'build-time route optimization',
    'MDX bundle splitting',
    'live Next.js route bundle benchmark',
    'encoded and decoded JavaScript bundle size',
    'route load duration comparison',
    'App Router and Pages Router bundle benchmark',
    'Fumadocs route splitting integration',
    'Next.js docs framework integration',
    'headless CMS route splitting potential',
    'page builder route splitting potential'
  ],
  authors: [
    {
      name: 'Project Millipede',
      url: GITHUB_URL
    }
  ],
  creator: 'Project Millipede',
  publisher: 'Project Millipede',
  category: 'developer tools',
  alternates: {
    canonical: '/'
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: SITE_NAME,
    title: `${SITE_NAME} | ${SITE_TITLE}`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: OPENGRAPH_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: `${SITE_NAME}: ${SITE_TITLE}`
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} | ${SITE_TITLE}`,
    description: SITE_DESCRIPTION,
    images: [TWITTER_IMAGE_PATH]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1
    }
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang='en'>
      <body>
        <SiteNav />
        {children}
        <SiteFooter />
      </body>
      {GOOGLE_ANALYTICS_ID !== '' ? (
        <GoogleAnalytics gaId={GOOGLE_ANALYTICS_ID} />
      ) : null}
    </html>
  );
}
