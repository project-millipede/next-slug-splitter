import {
  defineRouteHandlerProcessor,
  packageModule,
  relativeModule
} from 'next-slug-splitter/next';

const loadableComponentKeySet = new Set([
  'ExamplePreview',
  'FlowComposer',
  'ComponentWorkbench'
]);

// Shared package boundary reused for every generated component import.
const componentsModule = packageModule('@next-slug-splitter/ballast-kit');

export const routeHandlerProcessor = defineRouteHandlerProcessor({
  resolve({ capturedComponentKeys }) {
    const loadableComponentKeys = capturedComponentKeys.filter(key =>
      loadableComponentKeySet.has(key)
    );

    return {
      factoryImport: relativeModule('lib/handler-factory/runtime'),
      components: loadableComponentKeys.map(key => ({
        key,
        componentImport: {
          source: componentsModule,
          kind: 'named',
          importedName: key
        }
      }))
    };
  }
});
