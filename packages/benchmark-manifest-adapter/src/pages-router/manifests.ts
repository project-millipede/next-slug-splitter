import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isObjectRecord } from '../common';
import { extractStaticAssignment } from '../parsers/static-javascript';
import type { AdapterStaticFileOutput } from '../types';

/**
 * Check whether a static output points at the Pages Router client manifest.
 *
 * @param output Static output from the adapter build context.
 * @param buildId Next build id for the current build.
 * @returns True when the output represents `_buildManifest.js`.
 */
const isPagesClientBuildManifestOutput = (
  output: AdapterStaticFileOutput,
  buildId: string
): boolean => {
  const expectedSuffix = path.join('static', buildId, '_buildManifest.js');

  return output.filePath.endsWith(expectedSuffix);
};

/**
 * Resolve the Pages Router `_buildManifest.js` path from adapter outputs.
 *
 * @param buildId Next build id for the current build.
 * @param staticFiles Static outputs from the adapter build context.
 * @returns Absolute client build-manifest path.
 * @throws When the adapter outputs do not include `_buildManifest.js`.
 */
export const resolvePagesClientBuildManifestPath = (
  buildId: string,
  staticFiles: ReadonlyArray<AdapterStaticFileOutput>
): string => {
  const clientBuildManifestOutput = staticFiles.find(candidate =>
    isPagesClientBuildManifestOutput(candidate, buildId)
  );

  if (clientBuildManifestOutput == null) {
    throw new Error(
      `Missing Pages Router client build manifest output for build "${buildId}".`
    );
  }

  return clientBuildManifestOutput.filePath;
};

/**
 * Read the Pages Router static build manifest.
 *
 * Next writes `_buildManifest.js` as JavaScript that assigns
 * `self.__BUILD_MANIFEST`. The script is parsed as static JavaScript data so
 * the manifest can be read without executing the generated file.
 *
 * @param buildManifestPath Absolute path to `_buildManifest.js`.
 * @returns Raw build manifest keyed by Pages Router route.
 */
export const parseStaticBuildManifest = async (
  buildManifestPath: string
): Promise<Record<string, unknown>> => {
  const source = await readFile(buildManifestPath, 'utf8');
  const manifest = extractStaticAssignment(
    source,
    buildManifestPath,
    'self.__BUILD_MANIFEST',
    left => left.getText() === 'self.__BUILD_MANIFEST'
  );

  if (!isObjectRecord(manifest)) {
    throw new Error(
      `Unexpected build manifest shape in "${buildManifestPath}".`
    );
  }

  return manifest;
};

/**
 * Read Pages Router route assets from the root build manifest.
 *
 * Next's cross-bundler `.next/build-manifest.json` contains the complete
 * client asset arrays that correspond to each Pages Router route.
 *
 * @param buildManifestPath Absolute `.next/build-manifest.json` path.
 * @returns Route assets keyed by Pages Router route.
 */
export const parsePagesBuildManifest = async (
  buildManifestPath: string
): Promise<Record<string, unknown>> => {
  const source = await readFile(buildManifestPath, 'utf8');
  const manifest: unknown = JSON.parse(source);

  if (!isObjectRecord(manifest) || !isObjectRecord(manifest.pages)) {
    throw new Error(
      `Unexpected Pages build manifest shape in "${buildManifestPath}".`
    );
  }

  return manifest.pages;
};
