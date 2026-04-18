import {
  waitForWorkerTermination,
  type WorkerSessionRegistry
} from '../../../host/session-lifecycle';
import { runAsyncSequenceAndWait } from '../../../../async/async-sequence';
import { waitForWorkerHostLifecycleSessionReady } from '../../session-readiness';
import type { WorkerHostLifecycleSession } from '../../types';

import {
  toWorkerHostLifecycleError,
  waitForWorkerHostAcknowledgement
} from './error-helpers';
import type { WorkerHostLifecycleMachineContext } from './types';

/**
 * Shared session-operation helpers for the host lifecycle machine.
 *
 * @remarks
 * These helpers own the higher-level session actions the public machine
 * exposes:
 * - resolve, reuse, or replace one session
 * - gracefully shut one session down
 * - wait for full process termination where those flows require it
 *
 * The grouped internal machine context keeps those actions traceable:
 * - `context.session` owns compatibility, creation, startup, and replacement
 * - `context.shutdown` owns shutdown transport, timing, and force-close
 * - `context.processEvent` records the shared internal lifecycle transitions
 */

/**
 * Resolve, reuse, or replace one host-managed worker session.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 * @param input Resolution input.
 * @param input.context Grouped internal machine context captured from the
 * factory.
 * @param input.workerSessions Active worker-session registry.
 * @param input.request Worker-family session-resolution input.
 * @returns Ready host-managed session for the request.
 */
export const resolveWorkerHostLifecycleMachineSession = async <
  TResponse,
  TSession extends WorkerHostLifecycleSession<TResponse>,
  TRequest
>({
  context,
  workerSessions,
  request
}: {
  context: WorkerHostLifecycleMachineContext<TResponse, TSession, TRequest>;
  workerSessions: WorkerSessionRegistry<TSession>;
  request: TRequest;
}): Promise<TSession> => {
  /**
   * Split the grouped internal machine context into:
   * 1. the session rules for creation, reuse, and replacement
   * 2. the shutdown rules for force-close fallback
   * 3. the shared event processor for lifecycle transitions
   * 4. the worker label used in shared readiness and error messages
   */
  const {
    processEvent,
    session: sessionContext,
    shutdown: shutdownContext,
    workerLabel
  } = context;
  const sessionKey = sessionContext.createSessionKey(request);
  const existingSession = workerSessions.get(sessionKey);

  if (existingSession != null) {
    /**
     * 1. Resolve against an existing registry entry:
     *    1. reuse compatible live sessions
     *    2. replace incompatible live sessions
     *    3. wait out non-live sessions before retrying
     */
    if (
      existingSession.phase === 'starting' ||
      existingSession.phase === 'ready'
    ) {
      if (
        sessionContext.isSessionReusable({
          session: existingSession,
          request
        }) === 'reuse'
      ) {
        /**
         * 1A. Reuse the compatible live session:
         *     1. if it is still `starting`, join the shared readiness boundary
         *     2. return the same session instance afterward
         */
        if (existingSession.phase === 'starting') {
          await waitForWorkerHostLifecycleSessionReady(
            workerLabel,
            existingSession
          );
        }

        return existingSession;
      }

      /**
       * 1B. Replace the incompatible live session:
       *     1. publish `replacement-requested`
       *     2. shut the existing session down while it still owns the registry slot
       *     3. recurse only after teardown finishes
       */
      await processEvent({
        context: {
          workerSessions
        },
        event: {
          subject: 'replacement-requested',
          payload: {
            session: existingSession,
            request,
            reason: sessionContext.replaceReason
          }
        }
      });
      await shutdownWorkerHostLifecycleMachineSession({
        context,
        workerSessions,
        session: existingSession,
        reason: sessionContext.replaceReason
      });

      return await resolveWorkerHostLifecycleMachineSession({
        context,
        workerSessions,
        request
      });
    }

    /**
     * 1C. Retry after a non-live session:
     *     1. wait for termination cleanup to finish
     *     2. recurse after the registry entry becomes stable
     */
    await existingSession.terminationPromise;

    return await resolveWorkerHostLifecycleMachineSession({
      context,
      workerSessions,
      request
    });
  }

  /**
   * 2. Create and publish a fresh session:
   *    1. build the session from the worker-family factory
   *    2. publish it in the registry before startup begins
   */
  const nextSession = sessionContext.createSession({
    workerSessions,
    request
  });

  /**
   * This early publication lets concurrent resolution for the same key join
   * the same in-flight lifecycle instead of creating a duplicate worker
   * process.
   */
  workerSessions.set(nextSession.sessionKey, nextSession);

  try {
    /**
     * 3. Run the shared startup async sequence:
     *    1. `execute(...)` runs worker-family startup
     *    2. `resolve(...)` publishes `session-ready`
     *    3. `reject(...)` publishes startup failure plus force-close fallback
     *    4. `wait(...)` joins the shared readiness boundary
     *    5. `runAsyncSequenceAndWait(...)` re-joins the original sequence
     *       after readiness
     */
    await runAsyncSequenceAndWait({
      execute: async (): Promise<void> => {
        /**
         * 3A. Startup execution step:
         *     1. delegate worker-family startup to the session rules
         *     2. let the shared async sequence own success or failure after that
         */
        await sessionContext.startSession?.({
          session: nextSession,
          request
        });
      },
      resolve: async (): Promise<void> => {
        /**
         * 3B. Successful startup publication:
         *     1. publish `session-ready`
         *     2. let joined callers cross the shared readiness boundary
         */
        await processEvent({
          context: {
            workerSessions
          },
          event: {
            subject: 'session-ready',
            payload: {
              session: nextSession
            }
          }
        });
      },
      reject: async (error): Promise<void> => {
        /**
         * 3C. Startup failure fallback:
         *     1. publish `session-start-failed`
         *     2. publish `force-close-requested`
         *     3. invoke the transport-level force-close immediately after
         */
        await processEvent({
          context: {
            workerSessions
          },
          event: {
            subject: 'session-start-failed',
            payload: {
              session: nextSession,
              error
            }
          }
        });
        await processEvent({
          context: {
            workerSessions
          },
          event: {
            subject: 'force-close-requested',
            payload: {
              session: nextSession,
              reason: 'session-start-failed'
            }
          }
        });
        shutdownContext.invokeForceClose({
          workerSessions,
          session: nextSession,
          reason: 'session-start-failed'
        });
      },
      wait: async (): Promise<void> => {
        /**
         * 3D. Shared readiness join:
         *     1. wait on the shared readiness boundary
         *     2. let the async sequence surface completion only after readiness
         */
        await waitForWorkerHostLifecycleSessionReady(workerLabel, nextSession);
      },
      normalizeError: error =>
        toWorkerHostLifecycleError(
          error,
          `next-slug-splitter ${workerLabel} failed during startup.`
        )
    });
    return nextSession;
  } catch (error) {
    /**
     * 4. Session-resolution boundary normalization:
     *    1. normalize any startup-sequence failure at the outer resolution boundary
     *    2. surface one consistent session-resolution error to callers
     */
    throw toWorkerHostLifecycleError(
      error,
      `next-slug-splitter ${workerLabel} failed to resolve a session.`
    );
  }
};

/**
 * Gracefully shut down one host-managed worker session.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 * @param input Shutdown input.
 * @param input.context Grouped internal machine context captured from the
 * factory.
 * @param input.workerSessions Active worker-session registry.
 * @param input.session Session being shut down.
 * @param input.reason Diagnostic reason recorded for the shutdown.
 * @returns `void` after shutdown or forced close has fully terminated.
 */
export const shutdownWorkerHostLifecycleMachineSession = async <
  TResponse,
  TSession extends WorkerHostLifecycleSession<TResponse>,
  TRequest
>({
  context,
  workerSessions,
  session,
  reason
}: {
  context: WorkerHostLifecycleMachineContext<TResponse, TSession, TRequest>;
  workerSessions: WorkerSessionRegistry<TSession>;
  session: TSession;
  reason: string;
}): Promise<void> => {
  /**
   * Split the grouped internal machine context into the shutdown rules and the
   * shared event processor used by this shutdown flow.
   */
  const { processEvent, shutdown: shutdownContext, workerLabel } = context;
  /**
   * Early Return 1
   * Reuse the in-flight shared shutdown promise when another caller already
   * started shutting this session down.
   */
  if (session.shutdownPromise != null) {
    await session.shutdownPromise;
    return;
  }

  /**
   * Early Return 2
   * If the session is already fully closed, only wait for the terminal
   * process-termination promise to settle.
   */
  if (session.phase === 'closed') {
    await session.terminationPromise;
    return;
  }

  /**
   * Early Return 3
   * If the session already failed, skip graceful shutdown and fall back
   * directly to force-close before awaiting final termination.
   */
  if (session.phase === 'failed') {
    if (!session.closed) {
      /**
       * Failed sessions skip graceful shutdown entirely:
       * 1. publish `force-close-requested`
       * 2. invoke the transport-level force-close immediately after
       */
      await processEvent({
        context: {
          workerSessions
        },
        event: {
          subject: 'force-close-requested',
          payload: {
            session,
            reason
          }
        }
      });
      shutdownContext.invokeForceClose({
        workerSessions,
        session,
        reason
      });
    }

    await session.terminationPromise;
    return;
  }

  const shutdownPromise = (async (): Promise<void> => {
    /**
     * 1. Start graceful shutdown:
     *    1. record `shutdown-requested`
     *    2. publish the shutdown phase before transport work begins
     */
    await processEvent({
      context: {
        workerSessions
      },
      event: {
        subject: 'shutdown-requested',
        payload: {
          session,
          reason
        }
      }
    });

    try {
      /**
       * 2. Send shutdown and wait only for acknowledgement:
       *    1. request shutdown transport
       *    2. wait for the acknowledgement window
       */
      const shutdownAcknowledgement = await waitForWorkerHostAcknowledgement(
        shutdownContext.requestShutdown({
          session,
          reason
        }),
        shutdownContext.acknowledgementTimeoutMs
      );

      /**
       * 3. Branch on the acknowledgement result:
       *    1. timeout means graceful shutdown did not make it through transport
       *    2. acknowledgement means the graceful path can continue
       */
      if (shutdownAcknowledgement === 'timeout') {
        /**
         * 3A. Missing acknowledgement fallback:
         *     1. publish `force-close-requested`
         *     2. invoke the transport-level force-close immediately after
         */
        await processEvent({
          context: {
            workerSessions
          },
          event: {
            subject: 'force-close-requested',
            payload: {
              session,
              reason
            }
          }
        });
        shutdownContext.invokeForceClose({
          workerSessions,
          session,
          reason
        });
      } else {
        /**
         * 3B. Acknowledged graceful path:
         *     1. continue only because shutdown transport succeeded
         *     2. optionally wait for full process termination next
         */
        if (
          shutdownContext.terminationTimeoutMs != null &&
          shutdownContext.terminationTimeoutErrorMessage != null
        ) {
          /**
           * 4. Branch on post-acknowledgement termination:
           *    1. termination in time keeps the graceful path
           *    2. timeout falls back to force-close
           */
          try {
            /**
             * 4A. Graceful termination window:
             *     1. wait for full process termination
             *     2. keep the graceful path if termination arrives in time
             */
            await waitForWorkerTermination(
              session,
              shutdownContext.terminationTimeoutMs,
              shutdownContext.terminationTimeoutErrorMessage
            );
          } catch {
            /**
             * 4B. Acknowledged-but-not-terminated fallback:
             *     1. publish `force-close-requested`
             *     2. invoke the transport-level force-close immediately after
             */
            await processEvent({
              context: {
                workerSessions
              },
              event: {
                subject: 'force-close-requested',
                payload: {
                  session,
                  reason
                }
              }
            });
            shutdownContext.invokeForceClose({
              workerSessions,
              session,
              reason
            });
          }
        }
      }
    } catch (error) {
      /**
       * 5. Shutdown transport failure path:
       *    1. normalize the transport failure
       *    2. publish `shutdown-failed`
       *    3. publish `force-close-requested`
       *    4. invoke the transport-level force-close immediately after
       */
      const shutdownError = toWorkerHostLifecycleError(
        error,
        `next-slug-splitter ${workerLabel} failed while sending shutdown.`
      );

      await processEvent({
        context: {
          workerSessions
        },
        event: {
          subject: 'shutdown-failed',
          payload: {
            session,
            reason,
            error: shutdownError
          }
        }
      });
      await processEvent({
        context: {
          workerSessions
        },
        event: {
          subject: 'force-close-requested',
          payload: {
            session,
            reason
          }
        }
      });
      shutdownContext.invokeForceClose({
        workerSessions,
        session,
        reason
      });
    }

    /**
     * 6. Final shared shutdown wait:
     *    1. wait for the child-process termination signal
     *    2. settle the shared shutdown promise only after termination
     */
    await session.terminationPromise;
  })();

  /**
   * Publish the shared shutdown promise immediately so later callers can join
   * the same shutdown work instead of starting a second flow for the same
   * session.
   */
  session.shutdownPromise = shutdownPromise;

  await session.shutdownPromise;
};

/**
 * Observe full process termination for one host-managed worker session.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 * @param input Termination-observation input.
 * @param input.context Grouped internal machine context captured from the
 * factory.
 * @param input.workerSessions Active worker-session registry.
 * @param input.session Session whose child process has terminated.
 * @param input.rejectionError Optional process-exit error surfaced to pending
 * callers.
 * @returns `void` after the termination event has been dispatched.
 */
export const observeWorkerHostLifecycleMachineSessionTermination = <
  TResponse,
  TSession extends WorkerHostLifecycleSession<TResponse>,
  TRequest
>({
  context,
  workerSessions,
  session,
  rejectionError
}: {
  context: WorkerHostLifecycleMachineContext<TResponse, TSession, TRequest>;
  workerSessions: WorkerSessionRegistry<TSession>;
  session: TSession;
  rejectionError?: Error;
}): void => {
  /**
   * Reuse the grouped internal event processor for the termination-observation
   * path.
   */
  const { processEvent } = context;

  /**
   * Termination observation is fire-and-forget from the callback site because
   * the underlying child-process exit has already happened. The async event
   * processor is only responsible for lifecycle bookkeeping and promise
   * settlement after that terminal signal.
   */
  void processEvent({
    context: {
      workerSessions
    },
    event: {
      subject: 'termination-observed',
      payload: {
        session,
        rejectionError
      }
    }
  });
};
