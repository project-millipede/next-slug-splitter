/**
 * Shared generic subject-resolution core for worker dispatch helpers.
 *
 * @remarks
 * This module extracts the minimal common mechanism used by both shared
 * worker dispatchers:
 * - resolve one handler from a typed map via `subject`
 * - preserve discriminated-union narrowing per subject
 * - keep wrapper-specific invocation shapes outside the generic layer
 *
 * The host lifecycle wrapper still invokes handlers with `{ event, context }`,
 * while the worker runtime wrapper still invokes handlers with
 * `{ action, state }`.
 */

/**
 * Minimal discriminated shape supported by the shared subject-dispatch core.
 */
type SubjectDispatchItem = {
  /**
   * Discriminating subject used to resolve one typed handler.
   */
  subject: string;
};

/**
 * Normalize one handler input shape from generic property names.
 *
 * @remarks
 * The shared dispatcher core is generic over the caller's preferred field
 * names, but the resolved handler still needs one concrete object shape.
 *
 * This helper builds that shape from:
 * 1. the property name used for the discriminated item
 * 2. the property name used for the shared dispatch context
 *
 * So the shared core can stay generic while wrappers still expose natural
 * handler signatures such as `{ action, state }` or `{ event, context }`.
 *
 * @example
 * ```ts
 * type RuntimeInput = SubjectDispatchHandlerInput<
 *   'action',
 *   'state',
 *   BootstrapAction,
 *   ExtensionState
 * >;
 * // equivalent to:
 * // { action: BootstrapAction; state: ExtensionState }
 * ```
 *
 * @template TItemKey Property name used for the discriminated item.
 * @template TContextKey Property name used for the dispatch context.
 * @template TItem Narrowed discriminated item handled by the function.
 * @template TContext Shared context passed into the function.
 */
type SubjectDispatchHandlerInput<
  TItemKey extends string,
  TContextKey extends string,
  TItem extends SubjectDispatchItem,
  TContext
> = Record<TItemKey, TItem> & Record<TContextKey, TContext>;

/**
 * Full subject union carried by one discriminated item union.
 *
 * @template TItem Full discriminated-item union handled by the dispatcher.
 */
type SubjectDispatchSubject<TItem extends SubjectDispatchItem> =
  TItem['subject'];

/**
 * Narrow one discriminated item union down to a single `subject`.
 *
 * @template TItem Full discriminated-item union handled by the dispatcher.
 * @template TSubject Concrete subject within the union.
 */
type SubjectDispatchItemForSubject<
  TItem extends SubjectDispatchItem,
  TSubject extends SubjectDispatchSubject<TItem>
> = Extract<TItem, { subject: TSubject }>;

/**
 * One typed handler resolved by a discriminated `subject`.
 *
 * @template TItemKey Property name used for the discriminated item.
 * @template TContextKey Property name used for the dispatch context.
 * @template TItem Narrowed discriminated item handled by this function.
 * @template TContext Shared context passed into the function.
 * @template TResult Result returned by the function.
 */
export type SubjectDispatchHandler<
  TItemKey extends string,
  TContextKey extends string,
  TItem extends SubjectDispatchItem,
  TContext,
  TResult
> = (
  input: SubjectDispatchHandlerInput<TItemKey, TContextKey, TItem, TContext>
) => Promise<TResult>;

/**
 * One typed handler bound to one concrete `subject` within a discriminated
 * item union.
 *
 * @template TItemKey Property name used for the discriminated item.
 * @template TContextKey Property name used for the dispatch context.
 * @template TItem Full discriminated-item union handled by the dispatcher.
 * @template TContext Shared context passed into the function.
 * @template TResult Result returned by the function.
 * @template TSubject Concrete subject within the union.
 */
type SubjectDispatchHandlerForSubject<
  TItemKey extends string,
  TContextKey extends string,
  TItem extends SubjectDispatchItem,
  TContext,
  TResult,
  TSubject extends SubjectDispatchSubject<TItem>
> = SubjectDispatchHandler<
  TItemKey,
  TContextKey,
  SubjectDispatchItemForSubject<TItem, TSubject>,
  TContext,
  TResult
>;

/**
 * Build one handler registry from a discriminated item union.
 *
 * @remarks
 * Each subject in the union becomes one required property in the resulting
 * handler map, and each property receives the correctly narrowed handler type
 * for that subject.
 *
 * This lets callers define handlers once in an object literal while still
 * getting subject-specific payload narrowing inside each handler body.
 *
 * @example
 * ```ts
 * type RuntimeHandlers = SubjectDispatchHandlerMap<
 *   'action',
 *   'state',
 *   BootstrapAction | ResolveLazyMissAction,
 *   ExtensionState,
 *   WorkerDispatchResult<ResponseAction, ExtensionState>
 * >;
 *
 * // equivalent to a shape like:
 * // {
 * //   bootstrap: (input: { action: BootstrapAction; state: ExtensionState }) => ...
 * //   'resolve-lazy-miss': (
 * //     input: { action: ResolveLazyMissAction; state: ExtensionState }
 * //   ) => ...
 * // }
 * ```
 *
 * @template TItemKey Property name used for the discriminated item.
 * @template TContextKey Property name used for the dispatch context.
 * @template TItem Full discriminated-item union handled by the dispatcher.
 * @template TContext Shared context passed into each handler.
 * @template TResult Result returned by each handler.
 */
export type SubjectDispatchHandlerMap<
  TItemKey extends string,
  TContextKey extends string,
  TItem extends SubjectDispatchItem,
  TContext,
  TResult
> = {
  [TSubject in SubjectDispatchSubject<TItem>]: SubjectDispatchHandlerForSubject<
    TItemKey,
    TContextKey,
    TItem,
    TContext,
    TResult,
    TSubject
  >;
};

/**
 * One resolved handler returned from the shared subject lookup seam.
 *
 * @remarks
 * This alias keeps the remaining lookup cast readable without changing the
 * underlying callable shape.
 */
type ResolvedSubjectDispatchHandler<
  TItemKey extends string,
  TContextKey extends string,
  TItem extends SubjectDispatchItem,
  TContext,
  TResult
> = SubjectDispatchHandler<TItemKey, TContextKey, TItem, TContext, TResult>;

/**
 * Resolve one typed handler by `subject`.
 *
 * @remarks
 * The cast inside this helper is intentional.
 *
 * Why TypeScript still needs help here:
 * 1. `handlers` is a mapped type whose value type varies by `subject`.
 * 2. `subject` is only known here as the full union `TItem['subject']`.
 * 3. TypeScript does not preserve the runtime relationship between the lookup
 *    key and the later wrapper invocation strongly enough to recover one
 *    callable handler type for the full handled union.
 *
 * Why this remains safe at runtime:
 * 1. the lookup key comes directly from the caller's discriminated item
 *    `subject`
 * 2. missing subjects fail immediately through the explicit runtime guard
 * 3. the concrete wrapper invokes the returned handler with the matching shape
 *
 * @template TItemKey Property name used for the discriminated item.
 * @template TContextKey Property name used for the dispatch context.
 * @template TItem Full discriminated-item union handled by the dispatcher.
 * @template TContext Shared context passed into the resolved handler.
 * @template TResult Result returned by the resolved handler.
 * @param input Shared dispatch input.
 * @param input.subject Discriminating subject used to resolve the handler.
 * @param input.handlers Typed handler map keyed by `subject`.
 * @param input.missingHandlerErrorPrefix Error prefix used when no handler is
 * registered for the subject.
 * @returns A handler compatible with the caller's handled union.
 */
export const resolveSubjectHandler = <
  TItemKey extends string,
  TContextKey extends string,
  TItem extends SubjectDispatchItem,
  TContext,
  TResult
>({
  subject,
  handlers,
  missingHandlerErrorPrefix
}: {
  subject: TItem['subject'];
  handlers: SubjectDispatchHandlerMap<
    TItemKey,
    TContextKey,
    TItem,
    TContext,
    TResult
  >;
  missingHandlerErrorPrefix: string;
}): ResolvedSubjectDispatchHandler<
  TItemKey,
  TContextKey,
  TItem,
  TContext,
  TResult
> => {
  /**
   * This cast is the narrow lookup seam:
   * - the handler map is keyed by subject-specific handler types
   * - the resolver returns one handler callable over the handled union
   */
  const handler = handlers[subject] as ResolvedSubjectDispatchHandler<
    TItemKey,
    TContextKey,
    TItem,
    TContext,
    TResult
  >;

  if (handler == null) {
    throw new Error(`${missingHandlerErrorPrefix} "${subject}".`);
  }

  return handler;
};
