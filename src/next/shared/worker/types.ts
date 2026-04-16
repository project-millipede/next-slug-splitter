/**
 * Shared typed worker action and envelope building blocks.
 *
 * @remarks
 * This module sits between the fully generic host/runtime transport helpers
 * and the worker-family-specific request/response unions:
 * - shared transport still owns IPC mechanics
 * - the runtime machine still owns lifecycle semantics
 * - concrete worker families still own their domain subjects and payloads
 *
 * The common protocol contract is:
 * - requests carry `requestId` plus `subject`
 * - success responses carry `subject`
 * - business data travels under `payload`
 * - control actions without data omit `payload`
 */

/**
 * Shared deferred settlement callbacks used by host-side worker promises.
 *
 * @template TValue Successful value carried by the deferred promise.
 */
export type SharedWorkerDeferredSettler<TValue> = {
  /**
   * Resolve the deferred promise with one successful value.
   */
  resolve: (value: TValue) => void;
  /**
   * Reject the deferred promise with one transport or lifecycle error.
   */
  reject: (error: Error) => void;
};

/**
 * Type-only brand key for the shared no-payload sentinel.
 *
 * Why `unique symbol` here:
 * 1. We want one nominal brand that ordinary payload objects cannot satisfy by
 *    structural coincidence.
 * 2. This stays type-only in practice. The declaration exists only so
 *    TypeScript can distinguish {@link NoPayload} from normal object payloads.
 * 3. The usual package-boundary concern is not relevant here because the brand
 *    key stays local to this module instead of flowing around as a public
 *    runtime symbol value.
 */
declare const NO_PAYLOAD_BRAND: unique symbol;

/**
 * Sentinel payload type used when an action intentionally carries no payload.
 */
export type NoPayload = {
  /**
   * Internal type-only brand that keeps the sentinel distinct from normal
   * payload objects.
   */
  readonly [NO_PAYLOAD_BRAND]: 'no-payload';
};

/**
 * Generic Logic Helper: Strict Conditional Check
 *
 * Branches types based on whether `Type` strictly extends `Constraint`,
 * disabling the default distributive behavior of conditional types.
 *
 * Mechanism:
 * 1. **Tuple Wrapping:** The syntax `[Type]` and `[Constraint]` wraps inputs
 *    into tuples.
 * 2. **Blocking Distribution:** TypeScript distributes conditional types over
 *    unions (e.g., checking `A` and `B` separately in `A | B`). Tuples cannot
 *    be distributed, forcing the compiler to treat `Type` as a single,
 *    indivisible unit.
 * 3. **Strict Comparison:** The check succeeds only if the entire `Type`
 *    (including all union members or `undefined`) fits within `Constraint`.
 *
 * @example
 * ```ts
 * // Scenario: Checking if a Union extends a single type.
 * type Input = string | number;
 *
 * // 1. Standard (Distributive) Behavior:
 * //   (string extends string) | (number extends string)
 * //   => 'Yes' | 'No'
 * type Standard = Input extends string ? 'Yes' : 'No';
 *
 * // 2. Strict (Non-Distributive) Behavior via helper:
 * //   [string | number] extends [string]
 * //   => 'No' (The complete union does not extend string)
 * type Result = IfStrictExtends<Input, string, 'Yes', 'No'>;
 * ```
 *
 * @template Type       The candidate type to check.
 * @template Constraint The target type to check against.
 * @template True       Result if the check passes.
 * @template False      Result if the check fails.
 */
export type IfStrictExtends<Type, Constraint, True, False> = [Type] extends [
  Constraint
]
  ? True
  : False;

/**
 * Strategy A for shared worker actions: omit the payload property entirely.
 */
type ActionWithoutPayloadProps = {};

/**
 * Strategy B for shared worker actions: include the structured payload.
 *
 * @template TPayload Payload type carried by the action.
 */
type ActionWithPayloadProps<TPayload> = {
  /**
   * Structured action payload for one worker request or response.
   */
  payload: TPayload;
};

/**
 * Conditional payload wrapper used by shared worker actions.
 *
 * @template TPayload Payload type for one action.
 */
type SharedWorkerActionPayload<TPayload> = IfStrictExtends<
  TPayload,
  NoPayload,
  ActionWithoutPayloadProps,
  ActionWithPayloadProps<TPayload>
>;

/**
 * Minimal request shape shared by every worker-family IPC request.
 */
export type SharedWorkerRequestBase = {
  /**
   * Correlation id used to match the response to the original request.
   */
  requestId: string;
};

/**
 * Canonical request action traveling from the host into one worker session.
 *
 * @template TSubject Discriminating request subject.
 * @template TPayload Structured payload for the request action.
 */
export type SharedWorkerRequestAction<
  TSubject extends string,
  TPayload = NoPayload
> = SharedWorkerRequestBase & {
  /**
   * Discriminating request subject routed by the shared runtime dispatcher.
   */
  subject: TSubject;
} & SharedWorkerActionPayload<TPayload>;

/**
 * Canonical successful response action traveling from the worker back to the
 * host.
 *
 * @template TSubject Discriminating response subject.
 * @template TPayload Structured payload for the response action.
 */
export type SharedWorkerResponseAction<
  TSubject extends string,
  TPayload = NoPayload
> = {
  /**
   * Discriminating response subject returned by the worker.
   */
  subject: TSubject;
} & SharedWorkerActionPayload<TPayload>;

/**
 * Minimal request-action shape used by shared worker dispatch and runtime
 * helpers.
 */
export type SharedWorkerAnyRequestAction = SharedWorkerRequestBase & {
  /**
   * Discriminating request subject.
   */
  subject: string;
};

/**
 * Minimal response-action shape used by shared worker transport helpers.
 */
export type SharedWorkerAnyResponseAction = {
  /**
   * Discriminating response subject.
   */
  subject: string;
};

/**
 * Shared graceful-shutdown request used by long-lived worker families.
 */
export type SharedWorkerShutdownRequest = SharedWorkerRequestAction<'shutdown'>;

/**
 * Shared graceful-shutdown acknowledgement returned by long-lived workers.
 */
export type SharedWorkerShutdownResponse =
  SharedWorkerResponseAction<'shutdown-complete'>;

/**
 * Shared worker-side success or failure response envelope.
 *
 * @template TResponse Successful worker response action type.
 */
export type SharedWorkerResponseEnvelope<TResponse> =
  | {
      /**
       * Correlation id copied from the originating request.
       */
      requestId: string;
      /**
       * Indicates a successful worker response.
       */
      ok: true;
      /**
       * Successful worker response action.
       */
      response: TResponse;
    }
  | {
      /**
       * Correlation id copied from the originating request.
       */
      requestId: string;
      /**
       * Indicates a failed worker response.
       */
      ok: false;
      /**
       * Serialized worker error payload returned to the host.
       */
      error: {
        /**
         * Stringified worker error message.
         */
        message: string;
      };
    };
