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

import { createConfigMissingError } from '../utils/errors';
import { resolveRouteHandlersConfigsFromAppConfig } from './config/resolve-configs';
import {
  loadRouteHandlersConfigOrRegistered,
  resolveRouteHandlersAppContext
} from './internal/route-handlers-bootstrap';
import {
  resolveRegisteredSlugSplitterConfigRegistration
} from './integration/slug-splitter-config';
import {
  createRouteHandlerLookupSnapshot,
  writeRouteHandlerLookupSnapshot
} from './lookup-persisted';
import { withRouteHandlerRewrites } from './plugin';
import { prepareRouteHandlersFromConfig } from './prepare';
import { applyRouteHandlerProxyNextConfigPolicy } from './policy/proxy-next-config';
import { synchronizeRouteHandlerPhaseArtifacts } from './phase-artifacts';
import { synchronizeRouteHandlerProxyFile } from './proxy/file-lifecycle';
import { resolveRouteHandlerRoutingStrategy } from './routing-strategy';
import { deriveRouteHandlerRuntimeSemantics } from './runtime-semantics/derive';
import { writeRouteHandlerRuntimeSemantics } from './runtime-semantics/write';
import { executeResolvedRouteHandlerNextPipeline } from './runtime';

import type {
  ResolvedRouteHandlersConfig,
  RouteHandlerNextResult,
  RewriteRecord
} from './types';

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
 * Generate route-handler rewrites for the current app configuration.
 *
 * @param resolvedConfigs - Fully resolved target configs for generation.
 * @returns Generated route-handler rewrites.
 */
const generateRewrites = async (
  resolvedConfigs: Array<ResolvedRouteHandlersConfig>
): Promise<RouteHandlerNextResult> => {
  // This is the main hand-off from the adapter layer into the deeper runtime
  // pipeline. Everything below this call now executes fresh target work and,
  // in generate mode, rebuilds the emitted handler directories.
  return executeResolvedRouteHandlerNextPipeline({
    resolvedConfigs,
    mode: 'generate'
  });
};

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
    const runtimeSemantics = deriveRouteHandlerRuntimeSemantics(config);
    await writeRouteHandlerRuntimeSemantics(
      appContext.appConfig.rootDir,
      runtimeSemantics
    );

    // Preparation must run before config resolution. The `prepare` contract
    // exists so that app-owned build steps — such as compiling a TypeScript
    // processor to JavaScript — can materialize artifacts that the rest of the
    // pipeline depends on. Config resolution validates that referenced modules
    // (e.g. `processorImport`) exist on disk, so any preparation that produces
    // those modules must complete first. Without this ordering, a cold build
    // (no prior `dist/`) would fail validation before `prepare` ever ran.
    await prepareRouteHandlersFromConfig({
      rootDir: appContext.appConfig.rootDir,
      routeHandlersConfig: appContext.routeHandlersConfig
    });

    const resolvedConfigs = resolveRouteHandlersConfigsFromAppConfig({
      appConfig: appContext.appConfig,
      localeConfig: runtimeSemantics.localeConfig,
      routeHandlersConfig: appContext.routeHandlersConfig
    });
    const routingStrategy = resolveRouteHandlerRoutingStrategy({
      phase,
      routingPolicy: appContext.appConfig.routing
    });

    await synchronizeRouteHandlerPhaseArtifacts({
      resolvedConfigs,
      phase: routingStrategy.kind === 'proxy' ? 'dev' : 'build'
    });

    // This is the first routing-strategy split in the adapter. Before the
    // plugin decides whether it will install rewrites or rely on a generated
    // root Proxy file, it synchronizes the filesystem artifact that must match
    // the selected strategy.
    await synchronizeRouteHandlerProxyFile({
      rootDir: appContext.appConfig.rootDir,
      strategy: routingStrategy,
      resolvedConfigs,
      configRegistration: resolveRegisteredSlugSplitterConfigRegistration({
        rootDir: appContext.appConfig.rootDir
      })
    });

    if (routingStrategy.kind === 'proxy') {
      await writeRouteHandlerLookupSnapshot(
        appContext.appConfig.rootDir,
        createRouteHandlerLookupSnapshot(
          false,
          resolvedConfigs.map(config => config.targetId)
        )
      );

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

    // This call is the consumer-facing entrance into the adapter-side
    // execution stack. From here the request can travel through preparation,
    // phase-artifact ownership, and fresh runtime execution before rewrites
    // come back.
    const rewrites = await generateRewrites(resolvedConfigs);
    await writeRouteHandlerLookupSnapshot(
      appContext.appConfig.rootDir,
      createRouteHandlerLookupSnapshot(
        true,
        resolvedConfigs.map(config => config.targetId),
        rewrites
      )
    );

    // The returned value is the effective config for the current phase.
    // A wrapped copy is returned so the incoming config object stays unchanged.
    return withRouteHandlerRewrites(config, rewrites.rewrites);
  }
};

export default routeHandlersAdapter;
