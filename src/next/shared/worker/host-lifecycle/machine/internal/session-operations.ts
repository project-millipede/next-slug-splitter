import { waitForWorkerTermination } from '../../../host/session-lifecycle';
import type { WorkerSessionRegistry } from '../../../host/session-lifecycle';
import type { WorkerHostLifecycleSession } from '../../types';

import {
  toWorkerHostLifecycleError,
  waitForWorkerHostAcknowledgement,
  waitForWorkerHostSessionReady
} from './error-helpers';
import type { WorkerHostLifecycleMachineContext } from './types';

/**
 * Shared session-operation helpers for the host lifecycle machine.
 *
 * @remarks
 * These helpers own the higher-level session actions the public machine
 * exposes:
 * - resolve or replace one session
 * - gracefully shut one session down
 * - observe full process termination
 *
 * The grouped internal machine context keeps these flows traceable:
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
   * Split the grouped internal machine context into the session rules,
   * shutdown fallback rules, and the shared event processor used by this
   * resolution flow.
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
        if (existingSession.phase === 'starting') {
          await waitForWorkerHostSessionReady(workerLabel, existingSession);
        }

        return existingSession;
      }

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

    await existingSession.terminationPromise;

    return await resolveWorkerHostLifecycleMachineSession({
      context,
      workerSessions,
      request
    });
  }

  const nextSession = sessionContext.createSession({
    workerSessions,
    request
  });

  workerSessions.set(nextSession.sessionKey, nextSession);

  const startFlowPromise = (async (): Promise<void> => {
    try {
      await sessionContext.startSession?.({
        session: nextSession,
        request
      });
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
    } catch (error) {
      const readinessError = toWorkerHostLifecycleError(
        error,
        `next-slug-splitter ${workerLabel} failed during startup.`
      );

      await processEvent({
        context: {
          workerSessions
        },
        event: {
          subject: 'session-start-failed',
          payload: {
            session: nextSession,
            error: readinessError
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
      throw readinessError;
    }
  })();
  void startFlowPromise.catch(() => {});

  try {
    await waitForWorkerHostSessionReady(workerLabel, nextSession);
    await startFlowPromise;
    return nextSession;
  } catch (error) {
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
   * Early Return 3.
   * If the session already failed, skip graceful shutdown and fall back
   * directly to force-close before awaiting final termination.
   */
  if (session.phase === 'failed') {
    if (!session.closed) {
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
     * 1. Record that graceful shutdown has started before any shutdown
     *    transport is attempted.
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
       * 2. Send the shutdown request and wait only for its acknowledgement
       *    window, not for full process termination.
       */
      const shutdownAcknowledgement = await waitForWorkerHostAcknowledgement(
        shutdownContext.requestShutdown({
          session,
          reason
        }),
        shutdownContext.acknowledgementTimeoutMs
      );

      if (shutdownAcknowledgement === 'timeout') {
        /**
         * 3A. Treat the missing shutdown acknowledgement as a force-close
         *     condition and kill the underlying session immediately.
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
         * 3B. Continue after the worker acknowledged shutdown, so the graceful
         *     shutdown request made it through transport successfully.
         */
        if (
          shutdownContext.terminationTimeoutMs != null &&
          shutdownContext.terminationTimeoutErrorMessage != null
        ) {
          try {
            /**
             * 4. After acknowledgement, optionally wait for full process
             *    termination within the configured timeout window.
             */
            await waitForWorkerTermination(
              session,
              shutdownContext.terminationTimeoutMs,
              shutdownContext.terminationTimeoutErrorMessage
            );
          } catch {
            /**
             * 5. Treat the acknowledged-but-not-terminated timeout as a
             *    force-close condition and fall back to killing the session.
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
       * 3. Normalize the shutdown transport failure, record it in lifecycle
       *    state, and fall back to force-close immediately.
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
     * 6. Regardless of which shutdown branch ran, wait for the final
     *    child-process termination signal before this shared shutdown promise
     *    settles.
     */
    await session.terminationPromise;
  })();

  /**
   * Publish the shared shutdown promise immediately so later callers can join
   * the same shutdown work instead of starting a second flow.
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
