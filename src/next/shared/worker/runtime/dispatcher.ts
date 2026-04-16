import type { SharedWorkerAnyRequestAction } from '../types';

/**
 * Shared typed dispatcher for worker-family domain actions.
 *
 * @remarks
 * This helper stays intentionally narrow:
 * - shared runtime lifecycle stays outside the dispatcher
 * - worker-family domain subjects stay outside shared transport
 * - handlers are resolved by `subject` with discriminated-union narrowing
 *
 * Shared control actions such as `shutdown` are owned by the runtime machine
 * and should not be included in the handler map passed to this helper.
 */

/**
 * Result returned by one worker-family domain handler.
 *
 * @template TResponse Successful domain response action.
 * @template TExtensionState Retained worker-family state.
 */
export type SharedWorkerDispatchResult<TResponse, TExtensionState> = {
  /**
   * Successful domain response action returned by the handler.
   */
  response: TResponse;
  /**
   * Optional next retained worker-family state.
   */
  nextExtensionState?: TExtensionState;
};

/**
 * One typed worker-family domain handler keyed by request `subject`.
 *
 * @template TAction Narrowed request action handled by this function.
 * @template TResponse Successful domain response action.
 * @template TExtensionState Retained worker-family state.
 */
export type SharedWorkerSubjectHandler<
  TAction extends SharedWorkerAnyRequestAction,
  TResponse,
  TExtensionState
> = (input: {
  /**
   * Narrowed request action for this handler.
   */
  action: TAction;
  /**
   * Current retained worker-family state.
   */
  state: TExtensionState;
}) => Promise<SharedWorkerDispatchResult<TResponse, TExtensionState>>;

/**
 * Typed handler map used by the shared worker dispatcher.
 *
 * @template TRequest Full request union for one worker family.
 * @template TResponse Successful domain response action.
 * @template TExtensionState Retained worker-family state.
 * @template TSharedSubject Shared control subjects excluded from the map.
 */
export type SharedWorkerSubjectHandlerMap<
  TRequest extends SharedWorkerAnyRequestAction,
  TResponse,
  TExtensionState,
  TSharedSubject extends string
> = {
  [TSubject in Exclude<TRequest['subject'], TSharedSubject>]: SharedWorkerSubjectHandler<
    Extract<TRequest, { subject: TSubject }>,
    TResponse,
    TExtensionState
  >;
};

/**
 * Resolve one domain request action by `subject`.
 *
 * @template TRequest Full request union for one worker family.
 * @template TResponse Successful domain response action.
 * @template TExtensionState Retained worker-family state.
 * @template TSharedSubject Shared control subjects excluded from the handler map.
 * @param input Dispatcher input.
 * @param input.action Request action to resolve.
 * @param input.state Current retained worker-family state.
 * @param input.handlers Typed handler map keyed by request `subject`.
 * @returns The resolved response action plus an optional next retained state.
 */
export const dispatchSharedWorkerRequestBySubject = async <
  TRequest extends SharedWorkerAnyRequestAction,
  TResponse,
  TExtensionState,
  TSharedSubject extends string
>({
  action,
  state,
  handlers
}: {
  action: Exclude<TRequest, { subject: TSharedSubject }>;
  state: TExtensionState;
  handlers: SharedWorkerSubjectHandlerMap<
    TRequest,
    TResponse,
    TExtensionState,
    TSharedSubject
  >;
}): Promise<SharedWorkerDispatchResult<TResponse, TExtensionState>> => {
  const handler = (
    handlers as unknown as Record<
      string,
      SharedWorkerSubjectHandler<
        Exclude<TRequest, { subject: TSharedSubject }>,
        TResponse,
        TExtensionState
      >
    >
  )[action.subject];

  if (handler == null) {
    throw new Error(
      `next-slug-splitter worker runtime does not support subject "${action.subject}".`
    );
  }

  return await handler({
    action,
    state
  });
};
