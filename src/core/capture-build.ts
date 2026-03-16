import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { globalExternals } from '@fal-works/esbuild-plugin-global-externals';
import buildMdx from '@mdx-js/esbuild';
import { compile } from '@mdx-js/mdx';
import type {
  BuildOptions,
  OnLoadArgs,
  OnResolveArgs,
  Plugin,
  PluginBuild
} from 'esbuild';
import esbuild from 'esbuild';
import type { PluggableList } from 'unified';

/**
 * Create the esbuild plugin that compiles nested MDX imports with the same
 * recma capture plugins as the root entry.
 *
 * @param input - Build helper input.
 * @returns The esbuild plugin used during capture builds.
 */
const createNestedMdxPlugin = ({
  remarkPlugins,
  recmaPlugins
}: {
  remarkPlugins: PluggableList;
  recmaPlugins: PluggableList;
}): Plugin => {
  return {
    name: 'route-handler-nested-mdx-loader',
    setup(build: PluginBuild) {
      build.onResolve(
        { filter: /\.mdx?$/ },
        ({ path: importPath, importer }: OnResolveArgs) => {
          if (importer.length === 0) return null;
          if (/^[./]/.test(importPath)) {
            return {
              path: path.resolve(path.dirname(importer), importPath),
              namespace: 'nested-mdx'
            };
          }
          if (importPath.startsWith('/')) {
            return {
              path: importPath,
              namespace: 'nested-mdx'
            };
          }
          return null;
        }
      );

      build.onLoad(
        { filter: /.*/, namespace: 'nested-mdx' },
        async ({ path: filePath }: OnLoadArgs) => {
          const fileContent = await readFile(filePath, 'utf8');
          const compiled = await compile(
            { value: fileContent, path: filePath },
            {
              remarkPlugins,
              recmaPlugins
            }
          );

          return {
            contents: String(compiled.value),
            loader: 'jsx'
          };
        }
      );
    }
  };
};

/**
 * Run the esbuild-based capture build for one MDX file.
 *
 * @param input - Build input.
 * @returns A promise that resolves once the capture build succeeds.
 */
export const runRouteCaptureBuild = async ({
  filePath,
  remarkPlugins,
  recmaPlugins
}: {
  filePath: string;
  remarkPlugins: PluggableList;
  recmaPlugins: PluggableList;
}): Promise<void> => {
  const nestedMdxPlugin = createNestedMdxPlugin({
    remarkPlugins,
    recmaPlugins
  });

  const buildOptions: BuildOptions = {
    entryPoints: [filePath],
    write: false,
    bundle: true,
    target: 'es2020',
    format: 'iife',
    globalName: 'Component',
    treeShaking: false,
    splitting: false,
    minify: false,
    keepNames: true,
    jsx: 'automatic',
    jsxImportSource: 'react',
    plugins: [
      globalExternals({
        react: {
          varName: 'React',
          type: 'cjs'
        },
        'react-dom': {
          varName: 'ReactDOM',
          type: 'cjs'
        },
        'react/jsx-runtime': {
          varName: '_jsx_runtime',
          type: 'cjs'
        }
      }),
      nestedMdxPlugin,
      buildMdx({
        remarkPlugins,
        recmaPlugins
      })
    ]
  };

  await esbuild.build(buildOptions);
};
