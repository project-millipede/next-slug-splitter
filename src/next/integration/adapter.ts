/**
 * Next adapter entrypoint for generated rewrite installation.
 *
 * @remarks
 * This file is one of the main consumer-facing call sites in the whole cache
 * architecture. When a Next app uses `withSlugSplitter(...)`, Next eventually
 * reaches this adapter and asks it to modify the effective config.
 *
 * The adapter touches several phase-local groups in sequence:
 * - first, app preparation so app-owned prerequisites are ready
 * - then phase-artifact ownership so dev and build do not trust each other's
 *   generated handler state
 * - then the deeper fresh runtime pipeline
 *
 * Documenting the grouping here is useful because this is where many readers
 * start when asking "what execution path do consumers actually hit when Next boots?"
 */
import type { NextAdapter } from 'next';
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER
} from 'next/constants.js';
import { resolveModuleReferenceToPath } from '../../module-reference';

import { createConfigMissingError } from '../../utils/errors';
import { requireAppRouteHandlersConfig } from '../app/config/router-kind';
import { resolveAppLocaleConfig } from '../app/config/locale';
import {
  createAppRouteLookupSnapshot,
  writeAppRouteLookupSnapshot
} from '../app/lookup-persisted';
import { resolveRouteHandlersConfigsFromAppConfig as resolveAppRouteHandlersConfigsFromAppConfig } from '../app/config/resolve-configs';
import { executeResolvedRouteHandlerNextPipeline as executeResolvedAppRouteHandlerNextPipeline } from '../app/runtime';
import type { ResolvedRouteHandlersConfig as ResolvedAppRouteHandlersConfig } from '../app/types';
import { resolvePagesLocaleConfig } from '../pages/config/locale';
import { requirePagesRouteHandlersConfig } from '../pages/config/router-kind';
import { resolveRouteHandlersConfigsFromAppConfig } from '../pages/config/resolve-configs';
import { resolveRouteHandlersAppContext } from '../shared/bootstrap/route-handlers-bootstrap';
import { resolveRegisteredSlugSplitterConfigRegistration } from './slug-splitter-config';
import { loadRouteHandlersConfigOrRegistered } from './route-handlers-config';
import {
  createRouteHandlerLookupSnapshot,
  writeRouteHandlerLookupSnapshot
} from '../shared/lookup-persisted';
import {
  createRouteHandlerProxyBootstrapGenerationToken,
  createRouteHandlerProxyBootstrapManifest,
  writeRouteHandlerProxyBootstrap
} from '../proxy/bootstrap-persisted';
import { withRouteHandlerRewrites } from '../shared/rewrites/plugin';
import { prepareRouteHandlersFromConfig } from '../shared/prepare/index';
import { applyRouteHandlerProxyNextConfigPolicy } from '../proxy/policy/proxy-next-config';
import { synchronizeRouteHandlerPhaseArtifacts } from '../shared/phase-artifacts';
import { synchronizeRouteHandlerProxyFile } from '../proxy/file-lifecycle';
import { resolveRouteHandlerRoutingStrategy } from '../shared/policy/routing-strategy';
import { executeResolvedRouteHandlerNextPipeline } from '../pages/runtime';
import { synchronizeRouteHandlerInstrumentationFile } from '../proxy/instrumentation/file-lifecycle';
import { resolveRouteHandlerRouterKind } from '../shared/config/router-kind';

/**
 * Determine whether the current Next phase should run route-handler
 * optimization work.
 *
 * @param phase Current Next phase string.
 * @returns `true` when the phase should participate in route-handler rewrite
 * generation.
 */
const isRouteOptimizedPhase = (phase: string): boolean =>
  // Route-handler optimization is only meaningful in phases where Next can
  // either generate assets or serve requests using generated assets. Phases
  // outside this set should not pay any routing or cache coordination cost.
  phase === PHASE_DEVELOPMENT_SERVER ||
  phase === PHASE_PRODUCTION_BUILD ||
  phase === PHASE_PRODUCTION_SERVER;

/**
 * Create the App-target metadata persisted into the lookup snapshot.
 *
 * @param resolvedConfigs Resolved App target configs produced by config
 * resolution.
 * @returns Snapshot-ready App target metadata.
 */
const createPersistedAppLookupTargets = (
  resolvedConfigs: Array<ResolvedAppRouteHandlersConfig>
) =>
  resolvedConfigs.map(resolvedConfig => ({
    targetId: resolvedConfig.targetId,
    handlerRouteParamName: resolvedConfig.handlerRouteParam.name,
    ...(resolvedConfig.pageDataCompilerConfig == null
      ? {}
      : {
          // The snapshot stores the resolved runtime path so page-time route
          // code never has to reload config or re-resolve module references.
          pageDataCompilerModulePath: resolveModuleReferenceToPath(
            resolvedConfig.app.rootDir,
            resolvedConfig.pageDataCompilerConfig.pageDataCompilerImport
          )
        })
  }));

const routeHandlersAdapter: NextAdapter = {
  name: 'route-handlers-adapter',
  async modifyConfig(config, { phase }) {
    if (!isRouteOptimizedPhase(phase)) {
      return config;
    }

    const routeHandlersConfig = await loadRouteHandlersConfigOrRegistered();
    if (routeHandlersConfig == null) {
      throw createConfigMissingError(
        'Missing registered routeHandlersConfig. Call withSlugSplitter(...) or createRouteHandlersAdapterPath(...) before exporting the Next config.'
      );
    }

    const appContext = resolveRouteHandlersAppContext(routeHandlersConfig);
    const routerKind = resolveRouteHandlerRouterKind(routeHandlersConfig);
    const appRouteHandlersConfig =
      routerKind === 'app'
        ? requireAppRouteHandlersConfig(
            routeHandlersConfig,
            'The App Router adapter path'
          )
        : undefined;
    const pagesRouteHandlersConfig =
      routerKind === 'pages'
        ? requirePagesRouteHandlersConfig(
            routeHandlersConfig,
            'The Pages Router adapter path'
          )
        : undefined;
    const localeConfig =
      routerKind === 'app'
        ? resolveAppLocaleConfig(appRouteHandlersConfig)
        : resolvePagesLocaleConfig(config);

    // Preparation must run before config resolution. The `prepare` contract
    // exists so that app-owned build steps — such as compiling a TypeScript
    // processor to JavaScript — can materialize artifacts that the rest of the
    // pipeline depends on. Config resolution validates that referenced modules
    // (e.g. `processorImport`) exist on disk, so any preparation that produces
    // those modules must complete first. Without this ordering, a cold build
    // (no prior `dist/`) would fail validation before `prepare` ever ran.
    await prepareRouteHandlersFromConfig(
      appContext.appConfig.rootDir,
      appContext.routeHandlersConfig
    );

    const appResolvedConfigs =
      routerKind === 'app'
        ? await resolveAppRouteHandlersConfigsFromAppConfig(
            appContext.appConfig,
            localeConfig,
            appRouteHandlersConfig
          )
        : undefined;
    const pagesResolvedConfigs =
      routerKind === 'pages'
        ? resolveRouteHandlersConfigsFromAppConfig(
            appContext.appConfig,
            localeConfig,
            pagesRouteHandlersConfig
          )
        : undefined;
    const resolvedConfigs = appResolvedConfigs ?? pagesResolvedConfigs ?? [];
    const appLookupTargets =
      routerKind === 'app'
        ? createPersistedAppLookupTargets(appResolvedConfigs ?? [])
        : undefined;
    const selectedRoutingStrategy = resolveRouteHandlerRoutingStrategy(
      phase,
      appContext.appConfig.routing
    );
    const routingStrategy = selectedRoutingStrategy;
    const configRegistration = resolveRegisteredSlugSplitterConfigRegistration(
      appContext.appConfig.rootDir
    );

    await synchronizeRouteHandlerPhaseArtifacts(
      resolvedConfigs,
      routingStrategy.kind === 'proxy' ? 'dev' : 'build'
    );

    // This is the first routing-strategy split in the adapter. Before the
    // plugin decides whether it will install rewrites or rely on a generated
    // root Proxy file, it synchronizes the filesystem artifact that must match
    // the selected strategy.
    await synchronizeRouteHandlerProxyFile({
      rootDir: appContext.appConfig.rootDir,
      strategy: routingStrategy,
      resolvedConfigs,
      configRegistration
    });
    await synchronizeRouteHandlerInstrumentationFile({
      rootDir: appContext.appConfig.rootDir,
      strategy: routingStrategy,
      routingPolicy: appContext.appConfig.routing,
      localeConfig,
      configRegistration
    });

    if (routingStrategy.kind === 'proxy') {
      const bootstrapGenerationToken =
        createRouteHandlerProxyBootstrapGenerationToken();

      await writeRouteHandlerProxyBootstrap(
        appContext.appConfig.rootDir,
        createRouteHandlerProxyBootstrapManifest(
          bootstrapGenerationToken,
          localeConfig,
          resolvedConfigs
        )
      );
      await writeRouteHandlerLookupSnapshot(
        appContext.appConfig.rootDir,
        createRouteHandlerLookupSnapshot(
          // Proxy development mode keeps page-time lookup read-only and leaves
          // cold heavy-route ownership discovery to request-time proxy routing.
          false,
          [],
          {
            localeConfig
          }
        )
      );
      if (appLookupTargets != null) {
        await writeAppRouteLookupSnapshot(
          appContext.appConfig.rootDir,
          createAppRouteLookupSnapshot(appLookupTargets)
        );
      }

      // Proxy mode is intentionally a distinct routing path. The adapter does
      // not generate or install route-handler rewrites up front in this branch.
      //
      // Instead, the generated root `proxy.ts` delegates requests back into the
      // library-owned proxy runtime, which consults cached heavy-route
      // knowledge on demand without any whole-target generate fallback.
      return applyRouteHandlerProxyNextConfigPolicy({
        config,
        routingStrategy
      });
    }

    const results =
      routerKind === 'app'
        ? await executeResolvedAppRouteHandlerNextPipeline(
            appResolvedConfigs ?? [],
            'generate'
          )
        : await executeResolvedRouteHandlerNextPipeline(
            pagesResolvedConfigs ?? [],
            'generate'
          );

    await writeRouteHandlerLookupSnapshot(
      appContext.appConfig.rootDir,
      createRouteHandlerLookupSnapshot(
        // Rewrite/build mode needs an exact heavy/light split up front so
        // `getStaticPaths` can filter heavy routes out of the light page.
        true,
        results,
        {
          localeConfig
        }
      )
    );
    if (appLookupTargets != null) {
      await writeAppRouteLookupSnapshot(
        appContext.appConfig.rootDir,
        createAppRouteLookupSnapshot(appLookupTargets)
      );
    }

    // The returned value is the effective config for the current phase.
    // A wrapped copy is returned so the incoming config object stays unchanged.
    // This is the one intentional flattening boundary: runtime results remain
    // target-local and bucketed, but Next config installation needs one final
    // rewrite list.
    return withRouteHandlerRewrites(config, [
      ...results.flatMap(result => [
        ...result.rewrites,
        ...result.rewritesOfDefaultLocale
      ])
    ]);
  }
};

export default routeHandlersAdapter;
