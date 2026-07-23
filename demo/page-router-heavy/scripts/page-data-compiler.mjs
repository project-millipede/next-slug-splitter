import { createHeavyMdxPageDataCompiler } from '@next-slug-splitter/mdx-build/create-page-data-compiler';

/**
 * Heavy-baseline page-data compiler for the Pages Router demo.
 *
 * The local module keeps the heavy package compile path discoverable while the
 * MDX/esbuild implementation itself is shared by all heavy baselines.
 */
export const pageDataCompiler = createHeavyMdxPageDataCompiler({
  contentDir: '../shared/docs-content/pages',
  label: 'Pages Router heavy'
});
