import { describe, expect, it } from 'vitest';

import { renderAppRouteHandlerPage } from '../../../generator/app/index';
import { absoluteModule, packageModule } from '../../../module-reference';
import {
  createLoadableComponentEntry,
  createPlannedHeavyRoute
} from '../../helpers/builders';

describe('App Router generator contract', () => {
  it('renders a generated App handler page that delegates to the route-owned page contract', () => {
    const renderedPage = renderAppRouteHandlerPage({
      paths: {
        rootDir: '/repo',
        contentPagesDir: '/repo/content',
        generatedDir: '/repo/app/content/generated-handlers'
      },
      heavyRoute: createPlannedHeavyRoute({
        locale: 'de',
        slugArray: ['guides', 'einfuehrung'],
        handlerId: 'de-guides-einfuehrung',
        handlerRelativePath: 'guides/einfuehrung/de',
        usedLoadableComponentKeys: ['SelectionComponent'],
        factoryImport: absoluteModule('/repo/runtime/create-handler-page.js'),
        componentEntries: [
          createLoadableComponentEntry({
            key: 'SelectionComponent',
            componentImport: {
              source: packageModule('@demo/components'),
              kind: 'named',
              importedName: 'SelectionComponent'
            },
            metadata: {
              runtimeTraits: ['selection']
            }
          })
        ]
      }),
      emitFormat: 'ts',
      routeModuleImport: absoluteModule('/repo/app/content/route-contract.ts'),
      handlerRouteParam: {
        name: 'slug',
        kind: 'catch-all'
      },
      routeBasePath: '/content',
      routeModuleContract: {
        hasGeneratePageMetadata: true,
        revalidate: false
      }
    });

    expect(renderedPage.pageFilePath).toBe(
      '/repo/app/content/generated-handlers/guides/einfuehrung/de/page.tsx'
    );
    expect(renderedPage.pageSource).toContain('const handlerParams = ');
    expect(renderedPage.pageSource).toContain(
      '"slug": ["guides", "einfuehrung"]'
    );
    expect(renderedPage.pageSource).toContain('generatePageMetadata');
    expect(renderedPage.pageSource).toContain('loadPageProps');
    expect(renderedPage.pageSource).toContain(
      'export const dynamicParams = false;'
    );
    expect(renderedPage.pageSource).toContain(
      'export const revalidate = false;'
    );
    expect(renderedPage.pageSource).toContain(
      'return generatePageMetadata(handlerParams);'
    );
    expect(renderedPage.pageSource).toContain(
      'const props = await loadPageProps(handlerParams);'
    );
    expect(renderedPage.pageSource).toContain(
      'return <HandlerPage {...props} />;'
    );
    expect(renderedPage.pageSource).toContain(
      "from '../../../../route-contract'"
    );
  });

  it('omits optional metadata and revalidate exports when the route contract does not provide them', () => {
    const renderedPage = renderAppRouteHandlerPage({
      paths: {
        rootDir: '/repo',
        contentPagesDir: '/repo/content',
        generatedDir: '/repo/app/content/generated-handlers'
      },
      heavyRoute: createPlannedHeavyRoute({
        locale: 'en',
        slugArray: ['guides', 'intro'],
        handlerId: 'en-guides-intro',
        handlerRelativePath: 'guides/intro/en',
        usedLoadableComponentKeys: [],
        factoryImport: absoluteModule('/repo/runtime/create-handler-page.js'),
        componentEntries: []
      }),
      emitFormat: 'ts',
      routeModuleImport: absoluteModule('/repo/app/content/route-contract.ts'),
      handlerRouteParam: {
        name: 'slug',
        kind: 'catch-all'
      },
      routeBasePath: '/content',
      routeModuleContract: {
        hasGeneratePageMetadata: false,
        revalidate: undefined
      }
    });

    expect(renderedPage.pageSource).not.toContain('generatePageMetadata');
    expect(renderedPage.pageSource).not.toContain('export const revalidate =');
  });
});
