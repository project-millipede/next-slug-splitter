/**
 * Callback contract for one concrete async sequence.
 *
 * @remarks
 * One async sequence input bundles the three execution hooks that
 * `runAsyncSequence(...)` drives in order:
 * 1. `execute()` runs the main work
 * 2. `resolve(result)` publishes the success path for that same run
 * 3. `reject(error)` publishes the failure path for that same run
 *
 * `normalizeError(...)` is optional support logic for the failure path.
 *
 * @template TResult Result returned by the execution step.
 */
export type AsyncSequenceInput<TResult = void> = {
  /**
   * Execute the main work for this exact async sequence run.
   */
  execute: () => Promise<TResult> | TResult;
  /**
   * Publish the success path for this exact async sequence run after
   * `execute()` completes successfully.
   */
  resolve: (result: TResult) => Promise<void> | void;
  /**
   * Publish the failure path for this exact async sequence run after
   * `execute()` throws or rejects.
   */
  reject: (error: Error) => Promise<void> | void;
  /**
   * Normalize unknown execution failures for this exact async sequence run
   * into `Error`.
   */
  normalizeError?: (error: unknown) => Error;
};

/**
 * Callback contract for one async sequence that must also wait on an external
 * boundary after the success path has been published.
 *
 * @remarks
 * This extends {@link AsyncSequenceInput} with one extra caller-supplied wait
 * step:
 * 1. run the normal `execute -> resolve/reject` sequence
 * 2. wait on one external boundary
 * 3. only then surface the final result or error
 *
 * @template TResult Result returned by the execution step.
 */
export type AsyncSequenceWithWaitInput<TResult = void> = AsyncSequenceInput<TResult> & {
  /**
   * Wait on one caller-supplied external boundary before the full sequence is
   * considered complete.
   */
  wait: () => Promise<void>;
};

/**
 * Normalize one unknown async-sequence failure into an `Error`.
 *
 * @param error Unknown failure.
 * @returns Normalized `Error`.
 */
const toAsyncSequenceError = (error: unknown): Error =>
  error instanceof Error
    ? error
    : new Error('Async sequence execution failed.');

/**
 * Run one execute/resolve/reject sequence.
 *
 * @remarks
 * Sequence:
 * 1. call `execute(...)` and await its result
 * 2. if step 1 succeeds, call `resolve(result)` and await its completion
 * 3. if steps 1-2 succeed, return the original `execute(...)` result
 * 4. if step 1 throws or rejects, normalize that failure into `Error`
 * 5. call `reject(normalizedError)` and await its completion
 * 6. rethrow the same normalized error after the reject hook finishes
 *
 * Behavioral contract:
 * 1. `resolve(...)` is part of the success path, not an independent callback
 * 2. `reject(...)` is part of the failure path, not a fallback return value
 * 3. the function always returns the original execution result on success
 * 4. the function always throws the normalized error on failure
 * 5. `resolve(...)` never runs after a failed `execute(...)`
 * 6. `reject(...)` never runs after a successful `execute(...)`
 *
 * @template TResult Result returned by the execution step.
 * @param input Async-sequence callbacks.
 * @returns The result produced by `execute(...)`.
 */
export const runAsyncSequence = async <TResult = void>({
  execute,
  resolve,
  reject,
  normalizeError = toAsyncSequenceError
}: AsyncSequenceInput<TResult>): Promise<TResult> => {
  try {
    /**
     * Steps 1-3:
     * - execute the main work
     * - publish the success path with the produced result
     * - return that same result to the caller
     */
    const result = await execute();

    await resolve(result);

    return result;
  } catch (error) {
    /**
     * Steps 4-6:
     * - normalize the unknown failure
     * - publish the failure path with the normalized error
     * - rethrow that same error to the caller
     */
    const normalizedError = normalizeError(error);

    await reject(normalizedError);
    throw normalizedError;
  }
};

/**
 * Run one execute/resolve/reject sequence and wait on an external boundary
 * before surfacing the final result.
 *
 * @remarks
 * Sequence:
 * 1. start `runAsyncSequence(...)` immediately and keep the returned promise
 * 2. attach a no-op rejection branch so early failure does not trigger
 *    unhandled-rejection noise while the caller is still blocked on `wait()`
 * 3. call `wait()` and await the external boundary
 * 4. after step 3 completes, await the original sequence promise
 * 5. return the final sequence result or throw the final sequence error
 *
 * Why steps 3 and 4 are separate:
 * 1. the main execution sequence and the external boundary may complete in
 *    either order
 * 2. callers sometimes need the external boundary to be crossed before they
 *    may observe success, even when the internal sequence has already finished
 * 3. the original sequence promise still has to be awaited afterward so late
 *    execution or resolve/reject failures are surfaced honestly
 *
 * @template TResult Result returned by the execution step.
 * @param input Async-sequence callbacks plus external waiter.
 * @returns The result produced by `execute(...)`.
 */
export const runAsyncSequenceAndWait = async <TResult = void>({
  wait,
  ...asyncSequenceInput
}: AsyncSequenceWithWaitInput<TResult>): Promise<TResult> => {
  /**
   * Step 1:
   * Start the main async sequence immediately so its internal execution and
   * resolve/reject hooks can proceed while the caller later waits on the
   * external boundary.
   */
  const sequencePromise = runAsyncSequence(asyncSequenceInput);

  /**
   * Step 2:
   * The execution sequence may reject before step 4 reaches the final await,
   * so detach the rejection branch while the caller is still blocked in step 3.
   */
  sequencePromise.catch(() => {});

  /**
   * Step 3:
   * Wait for the caller-supplied external boundary before surfacing full
   * completion.
   */
  await wait();

  /**
   * Steps 4-5:
   * Rejoin the original sequence after the external boundary has completed and
   * surface its final success or failure honestly.
   */
  return await sequencePromise;
};
