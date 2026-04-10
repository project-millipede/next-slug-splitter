/**
 * Public startup prewarm entrypoint used by the generated `instrumentation.ts`.
 *
 * @remarks
 * The startup integration belongs to the instrumentation subsystem, but the
 * actual worker prewarm mechanics still live in the proxy runtime because they
 * bootstrap the existing proxy worker session.
 */
export { prewarmRouteHandlerProxy as prewarmRouteHandlerProxyWorker } from '../runtime/prewarm';
