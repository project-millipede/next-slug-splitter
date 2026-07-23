export type ManifestKind = 'splitter' | 'heavy-baseline';

export type RouterKind = 'app' | 'pages';

export type AdapterRewrite = {
  /** Public route pattern exposed by Next's adapter routing metadata. */
  source?: string;
  /** Rewrite destination exposed by Next's adapter routing metadata. */
  destination?: string;
};

export type AdapterAppPageOutput = {
  /** Source route pattern for this App Router page output. */
  sourcePage: string;
  /** Absolute page entrypoint path emitted by the Next build. */
  filePath: string;
  /**
   * Assets required by a route output.
   *
   * Next keys these entries by their repository-relative output paths and
   * provides their absolute filesystem paths as values. App Page assets include
   * necessary manifests such as `page_client-reference-manifest.js`.
   */
  assets: Record<string, string>;
};

export type AdapterStaticFileOutput = {
  /** Absolute static-file path emitted by the Next build. */
  filePath: string;
};

export type AdapterBuildContext = {
  /** Absolute project directory for the app currently being built. */
  projectDir: string;
  /** Absolute `.next` build output directory. */
  distDir: string;
  /** Next build id for static asset lookup. */
  buildId: string;
  /** Routing metadata emitted by the Next adapter. */
  routing: {
    /** Rewrites that run before filesystem routes. */
    beforeFiles: ReadonlyArray<AdapterRewrite>;
  };
  /** Build outputs emitted by the Next adapter. */
  outputs: {
    /** App Router page outputs. */
    appPages: ReadonlyArray<AdapterAppPageOutput>;
    /** Pages Router outputs, whose presence identifies the router family. */
    pages: ReadonlyArray<unknown>;
    /** Static file outputs such as `_buildManifest.js`. */
    staticFiles: ReadonlyArray<AdapterStaticFileOutput>;
  };
};

/**
 * Resolve route-specific client JavaScript chunks for one router route.
 */
export type RouterChunkResolver = (
  context: AdapterBuildContext,
  zonePath: string,
  routePath: string
) => Promise<string[]>;

export type AppClientReferenceManifest = {
  /** Client JavaScript files keyed by App Router entry path. */
  entryJSFiles?: Record<string, string[]>;
};

/**
 * Internal JavaScript payload candidates resolved for one benchmark route.
 *
 * Router-specific resolvers produce these candidates so the manifest writer
 * can select one exact emitted payload. The candidate collection is not part
 * of the published manifest contract.
 */
export type BenchmarkRouteChunkCandidates = {
  /** Generated handler route without the website facade prefix. */
  generatedHandlerPath: string | null;
  /** Route-specific facade JavaScript paths eligible for payload selection. */
  chunks: string[];
};
