import type { WorkerAnyHostLifecycleEvent } from './types';

/**
 * Shared typed dispatcher for internal host lifecycle events.
 *
 * @remarks
 * This helper mirrors the runtime-side subject dispatcher while staying
 * clearly separate from the IPC wire protocol:
 * - events are internal to the parent process
 * - events use `subject + payload`
 * - events intentionally do not carry `requestId`
 * - worker-family business logic still lives outside this helper
 */

/**
 * One typed host lifecycle event handler keyed by `subject`.
 *
 * @template TEvent Narrowed lifecycle event handled by this function.
 * @template TResult Result returned by the handler.
 */
export type WorkerHostLifecycleEventHandler<
  TEvent extends WorkerAnyHostLifecycleEvent,
  TResult
> = (input: {
  /**
   * Narrowed lifecycle event for this handler.
   */
  event: TEvent;
}) => Promise<TResult>;

/**
 * Typed handler map used by the shared host lifecycle dispatcher.
 *
 * @template TEvent Full lifecycle-event union handled by the dispatcher.
 * @template TResult Result returned by each handler.
 */
export type WorkerHostLifecycleEventHandlerMap<
  TEvent extends WorkerAnyHostLifecycleEvent,
  TResult
> = {
  [TSubject in TEvent['subject']]: WorkerHostLifecycleEventHandler<
    Extract<TEvent, { subject: TSubject }>,
    TResult
  >;
};

/**
 * Resolve one internal host lifecycle event by `subject`.
 *
 * @template TEvent Full lifecycle-event union handled by the dispatcher.
 * @template TResult Result returned by the resolved handler.
 * @param event Lifecycle event to resolve.
 * @param handlers Typed handler map keyed by event `subject`.
 * @returns The value returned by the resolved handler.
 */
export const dispatchWorkerHostLifecycleEventBySubject = async <
  TEvent extends WorkerAnyHostLifecycleEvent,
  TResult
>(
  event: TEvent,
  handlers: WorkerHostLifecycleEventHandlerMap<TEvent, TResult>
): Promise<TResult> => {
  const handler = (
    handlers as unknown as Record<
      string,
      WorkerHostLifecycleEventHandler<TEvent, TResult>
    >
  )[event.subject];

  if (handler == null) {
    throw new Error(
      `next-slug-splitter host lifecycle does not support subject "${event.subject}".`
    );
  }

  return await handler({
    event
  });
};
