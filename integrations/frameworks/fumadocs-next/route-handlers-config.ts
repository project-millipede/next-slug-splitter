import path from 'node:path';
import process from 'node:process';

import {
  createAppCatchAllRouteHandlersPreset,
  relativeModule,
  type RouteHandlersConfig
} from 'next-slug-splitter/next';

const rootDir = process.cwd();

export const routeHandlersConfig: RouteHandlersConfig = {
  routerKind: 'app',
  app: {
    rootDir,
    /**
     * Use upfront rewrites in development so every generated Fumadocs handler
     * resolves on the first request. The default lazy dev proxy is useful while
     * iterating on splitter internals, but this integration should behave like
     * the production route graph when someone opens the example app.
     */
    routing: {
      development: 'rewrites'
    },
    prepare: {
      tsconfigPath: relativeModule('tsconfig.processor.json')
    }
  },
  targets: [
    createAppCatchAllRouteHandlersPreset({
      targetId: 'docs',
      routeSegment: 'docs',
      handlerRouteParam: {
        name: 'slug',
        kind: 'optional-catch-all'
      },
      contentDir: path.join(rootDir, 'content', 'docs'),
      contentLocaleMode: 'default-locale',
      routeContract: relativeModule('app/docs/[[...slug]]/route-contract'),
      handlerBinding: {
        processorImport: relativeModule('dist/handler-processor')
      }
    })
  ]
};

export default routeHandlersConfig;
