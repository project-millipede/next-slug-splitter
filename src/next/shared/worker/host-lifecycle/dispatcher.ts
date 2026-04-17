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
 * @template TContext Dynamic dispatch context passed into each handler.
 * @template TResult Result returned by the handler.
 */
export type WorkerHostLifecycleEventHandler<
  TEvent extends WorkerAnyHostLifecycleEvent,
  TContext,
  TResult
> = (input: {
  /**
   * Narrowed lifecycle event for this handler.
   */
  event: TEvent;
  /**
   * Dynamic per-dispatch context supplied by the caller.
   */
  context: TContext;
}) => Promise<TResult>;

/**
 * Typed handler map used by the shared host lifecycle dispatcher.
 *
 * @template TEvent Full lifecycle-event union handled by the dispatcher.
 * @template TContext Dynamic dispatch context passed into each handler.
 * @template TResult Result returned by each handler.
 */
export type WorkerHostLifecycleEventHandlerMap<
  TEvent extends WorkerAnyHostLifecycleEvent,
  TContext,
  TResult
> = {
  [TSubject in TEvent['subject']]: WorkerHostLifecycleEventHandler<
    Extract<TEvent, { subject: TSubject }>,
    TContext,
    TResult
  >;
};

/**
 * Resolve one internal host lifecycle event by `subject`.
 *
 * @template TEvent Full lifecycle-event union handled by the dispatcher.
 * @template TContext Dynamic dispatch context passed into the resolved handler.
 * @template TResult Result returned by the resolved handler.
 * @param input Dispatcher input.
 * @param input.event Lifecycle event to resolve.
 * @param input.context Dynamic per-dispatch context.
 * @param input.handlers Typed handler map keyed by event `subject`.
 * @returns The value returned by the resolved handler.
 */
export const dispatchWorkerHostLifecycleEventBySubject = async <
  TEvent extends WorkerAnyHostLifecycleEvent,
  TContext,
  TResult
>({
  event,
  context,
  handlers
}: {
  event: TEvent;
  context: TContext;
  handlers: WorkerHostLifecycleEventHandlerMap<TEvent, TContext, TResult>;
}): Promise<TResult> => {
  const handler = (
    handlers as unknown as Record<
      string,
      WorkerHostLifecycleEventHandler<TEvent, TContext, TResult>
    >
  )[event.subject];

  if (handler == null) {
    throw new Error(
      `next-slug-splitter host lifecycle does not support subject "${event.subject}".`
    );
  }

  return await handler({
    event,
    context
  });
};
