import type { WorkerAnyHostLifecycleEvent } from './types';
import {
  resolveSubjectHandler,
  type SubjectDispatchHandler,
  type SubjectDispatchHandlerMap
} from '../dispatch-by-subject';

const MISSING_HANDLER_ERROR_PREFIX =
  'next-slug-splitter host lifecycle has no handler for subject';

/**
 * Shared typed dispatcher for internal host lifecycle events.
 *
 * @remarks
 * This module is a thin semantic wrapper over `dispatch-by-subject.ts` using
 * the host lifecycle's `event` / `context` terminology.
 *
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
> = SubjectDispatchHandler<'event', 'context', TEvent, TContext, TResult>;

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
> = SubjectDispatchHandlerMap<'event', 'context', TEvent, TContext, TResult>;

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
  const handler = resolveSubjectHandler({
    subject: event.subject,
    handlers,
    missingHandlerErrorPrefix: MISSING_HANDLER_ERROR_PREFIX
  });

  return await handler({
    event,
    context
  });
};
