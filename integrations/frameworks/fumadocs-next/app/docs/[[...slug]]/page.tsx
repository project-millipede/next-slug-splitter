import { withHeavyRouteFilter } from 'next-slug-splitter/next/lookup';

import { createHandlerPage } from '../../../lib/handler-factory/runtime';
import {
  generatePageMetadata,
  getStaticParams,
  loadPageProps,
  type DocsRouteParams
} from './route-contract';

const DocsPage = createHandlerPage({
  loadableRegistrySubset: {}
});

export const dynamicParams = false;

export const generateStaticParams = withHeavyRouteFilter({
  targetId: 'docs',
  generateStaticParams: getStaticParams
});

export async function generateMetadata({
  params
}: {
  params: Promise<DocsRouteParams>;
}) {
  return generatePageMetadata(await params);
}

export default async function Page({
  params
}: {
  params: Promise<DocsRouteParams>;
}) {
  const props = await loadPageProps(await params);
  return <DocsPage {...props} />;
}
