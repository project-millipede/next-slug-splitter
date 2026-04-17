import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadRouteHandlerProxyRuntimeAttachments } from '../../../next/proxy/runtime-attachments';
import { withTempDir } from '../../helpers/temp-dir';

const writeRuntimeAttachmentsConfig = async (
  rootDir: string,
  configFileName: string
): Promise<string> => {
  const configPath = path.join(rootDir, configFileName);
  const source = [
    'const remarkPlugin = () => undefined;',
    'const recmaPlugin = () => undefined;',
    'export default {',
    "  routerKind: 'pages',",
    `  app: { rootDir: ${JSON.stringify(rootDir)} },`,
    "  targetId: 'docs',",
    "  routeBasePath: '/docs',",
    "  paths: { contentPagesDir: 'content/pages', handlersDir: 'pages/_handlers' },",
    "  handlerRouteParam: { name: 'slug', kind: 'catch-all' },",
    '  mdxCompileOptions: {',
    '    remarkPlugins: [remarkPlugin],',
    '    recmaPlugins: [recmaPlugin]',
    '  }',
    '};',
    ''
  ].join('\n');

  await writeFile(configPath, source, 'utf8');
  return configPath;
};

const writeAppRuntimeAttachmentsConfig = async (
  rootDir: string,
  configFileName: string
): Promise<string> => {
  const configPath = path.join(rootDir, configFileName);
  const source = [
    'const remarkPlugin = () => undefined;',
    'export default {',
    "  routerKind: 'app',",
    `  app: { rootDir: ${JSON.stringify(rootDir)} },`,
    "  targetId: 'docs',",
    "  routeBasePath: '/docs',",
    "  paths: { contentPagesDir: 'content/pages', handlersDir: 'app/docs/_handlers' },",
    "  handlerRouteParam: { name: 'slug', kind: 'catch-all' },",
    "  routeModuleImport: { kind: 'package', specifier: '@test/docs-route-module' },",
    '  mdxCompileOptions: {',
    '    remarkPlugins: [remarkPlugin]',
    '  }',
    '};',
    ''
  ].join('\n');

  await writeFile(configPath, source, 'utf8');
  return configPath;
};

describe('proxy runtime attachments loader', () => {
  it('loads runtime attachments from an explicit configPath', async () => {
    await withTempDir(
      'next-slug-splitter-runtime-attachments-',
      async rootDir => {
        const configPath = await writeRuntimeAttachmentsConfig(
          rootDir,
          'custom-route-handlers-config.mjs'
        );

        const runtimeAttachments =
          await loadRouteHandlerProxyRuntimeAttachments({
            rootDir,
            configPath
          });

        expect(Object.keys(runtimeAttachments)).toEqual(['docs']);
        expect(
          runtimeAttachments.docs.mdxCompileOptions.remarkPlugins
        ).toHaveLength(1);
        expect(
          runtimeAttachments.docs.mdxCompileOptions.recmaPlugins
        ).toHaveLength(1);
        expect(
          runtimeAttachments.docs.mdxCompileOptions.remarkPlugins?.[0]
        ).toEqual(expect.any(Function));
        expect(
          runtimeAttachments.docs.mdxCompileOptions.recmaPlugins?.[0]
        ).toEqual(expect.any(Function));
      }
    );
  });

  it('uses the conventional config filename heuristic when no explicit configPath is registered', async () => {
    await withTempDir(
      'next-slug-splitter-runtime-attachments-',
      async rootDir => {
        await writeRuntimeAttachmentsConfig(rootDir, 'route-handlers-config.mjs');

        const runtimeAttachments =
          await loadRouteHandlerProxyRuntimeAttachments({
            rootDir
          });

        expect(Object.keys(runtimeAttachments)).toEqual(['docs']);
        expect(
          runtimeAttachments.docs.mdxCompileOptions.remarkPlugins?.[0]
        ).toEqual(expect.any(Function));
      }
    );
  });

  it('throws a targeted error when no importable config module can be derived for runtime attachments', async () => {
    await withTempDir(
      'next-slug-splitter-runtime-attachments-',
      async rootDir => {
        await expect(
          loadRouteHandlerProxyRuntimeAttachments({
            rootDir
          })
        ).rejects.toThrow(
          'Route-handler proxy runtime attachments require an importable config module path.'
        );
      }
    );
  });

  it('loads App Router runtime attachments from the registered config module', async () => {
    await withTempDir(
      'next-slug-splitter-runtime-attachments-',
      async rootDir => {
        const configPath = await writeAppRuntimeAttachmentsConfig(
          rootDir,
          'route-handlers-config.mjs'
        );

        const runtimeAttachments =
          await loadRouteHandlerProxyRuntimeAttachments({
            rootDir,
            configPath
          });

        expect(Object.keys(runtimeAttachments)).toEqual(['docs']);
        expect(
          runtimeAttachments.docs.mdxCompileOptions.remarkPlugins?.[0]
        ).toEqual(expect.any(Function));
      }
    );
  });
});
