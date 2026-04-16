// AUTO-GENERATED ROUTE HANDLER. DO NOT EDIT.
// Source: /__next_slug_splitter_single_locale__/docs/dashboard
// Handler: __next_slug_splitter_single_locale__-dashboard
// Used loadable keys: ['Chart','DataTable']
import { createHandlerPage } from '../../../../lib/handler-factory/runtime';
import {
  generatePageMetadata,
  loadPageProps
} from '../../[...slug]/route-contract';
import {
  Chart,
  DataTable
} from '@demo/components';

export const revalidate = false;
const handlerParams = { "slug": ["dashboard"] };
const HandlerPage = createHandlerPage({
  loadableRegistrySubset: {
    Chart: {
      component: Chart,
      runtimeTraits: [
        'wrapper'
      ]
    },
    DataTable: {
      component: DataTable,
      runtimeTraits: [
        'selection'
      ]
    }
  }
});
export const dynamicParams = false;

export async function generateMetadata() {
  return generatePageMetadata(handlerParams);
}

export default async function Page() {
  const props = await loadPageProps(handlerParams);

  return <HandlerPage {...props} />;
}