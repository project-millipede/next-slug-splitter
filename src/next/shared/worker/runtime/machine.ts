import {
  WorkerShutdownResponse,
  type WorkerAnyRequestAction,
  type WorkerAnyResponseAction
} from '../types';
import { disconnectWorkerRuntimeProcess } from './entry';
import { handleWorkerRuntimeRequest } from './protocol';
import {
  dispatchWorkerRequestBySubject,
  type WorkerSubjectHandlerMap
} from './dispatcher';

/**
 * Shared worker runtime finite-state-machine helpers.
 *
 * @remarks
 * This module owns only the shared lifecycle shell above transport:
 * - process every request action through one explicit runtime phase machine
 * - handle shared control actions such as `shutdown`
 * - dispatch worker-family domain actions by `subject`
 * - keep retained worker-family state separate from shared lifecycle state
 *
 * Domain semantics stay outside this layer and are supplied through the
 * worker-family handler map and optional shutdown cleanup hook.
 */

/**
 * Lifecycle phase for one long-lived worker runtime.
 */
export type WorkerRuntimePhase = 'running' | 'shutting-down' | 'closed';

/**
 * Full shared runtime-machine state for one worker family.
 *
 * @template TExtensionState Retained worker-family state.
 */
export type WorkerRuntimeMachineState<TExtensionState> = {
  /**
   * Current shared lifecycle phase.
   */
  phase: WorkerRuntimePhase;
  /**
   * Current retained worker-family state.
   */
  extensionState: TExtensionState;
};

/**
 * Optional shutdown cleanup hook owned by one worker family.
 *
 * @template TExtensionState Retained worker-family state.
 */
export type WorkerRuntimeShutdownHandler<TExtensionState> = (input: {
  /**
   * Current retained worker-family state at shutdown start.
   */
  extensionState: TExtensionState;
}) => Promise<TExtensionState | void>;

/**
 * Runtime-machine creation options.
 *
 * @template TRequest Full worker-family request union.
 * @template TResponse Successful domain response-action union.
 * @template TExtensionState Retained worker-family state.
 */
export type CreateWorkerRuntimeMachineOptions<
  TRequest extends WorkerAnyRequestAction,
  TResponse extends WorkerAnyResponseAction,
  TExtensionState
> = {
  /**
   * Human-readable worker label used in error messages.
   */
  workerLabel: string;
  /**
   * Initial retained worker-family state.
   */
  initialExtensionState: TExtensionState;
  /**
   * Worker-family domain handler map keyed by request `subject`.
   */
  handlers: WorkerSubjectHandlerMap<
    TRequest,
    TResponse,
    TExtensionState,
    'shutdown'
  >;
  /**
   * Optional worker-family shutdown cleanup hook.
   */
  onShutdown?: WorkerRuntimeShutdownHandler<TExtensionState>;
};

/**
 * Public runtime-machine contract used by concrete worker entrypoints.
 *
 * @template TRequest Full worker-family request union.
 * @template TExtensionState Retained worker-family state.
 */
export type WorkerRuntimeMachine<
  TRequest extends WorkerAnyRequestAction,
  TExtensionState
> = {
  /**
   * Handle one request action through the shared runtime machine.
   *
   * @param request Request action received over IPC.
   * @returns `void` after the request has been answered.
   */
  handleRequest: (request: TRequest) => Promise<void>;
  /**
   * Read the current runtime-machine state.
   *
   * @returns The current lifecycle phase plus retained worker-family state.
   */
  getState: () => WorkerRuntimeMachineState<TExtensionState>;
};

/**
 * Build the shared shutdown acknowledgement action.
 *
 * @returns Shared shutdown acknowledgement action.
 */
const createWorkerShutdownResponse = (): WorkerShutdownResponse => ({
  subject: 'shutdown-complete'
});

/**
 * Create one shared runtime finite state machine.
 *
 * @template TRequest Full worker-family request union.
 * @template TResponse Successful domain response-action union.
 * @template TExtensionState Retained worker-family state.
 * @param options Runtime-machine creation options.
 * @param options.workerLabel Human-readable worker label used in error messages.
 * @param options.initialExtensionState Initial retained worker-family state.
 * @param options.handlers Worker-family domain handler map keyed by request
 * `subject`.
 * @param options.onShutdown Optional worker-family shutdown cleanup hook.
 * @returns Shared runtime machine for one worker family.
 */
export const createWorkerRuntimeMachine = <
  TRequest extends WorkerAnyRequestAction,
  TResponse extends WorkerAnyResponseAction,
  TExtensionState
>({
  workerLabel,
  initialExtensionState,
  handlers,
  onShutdown
}: CreateWorkerRuntimeMachineOptions<
  TRequest,
  TResponse,
  TExtensionState
>): WorkerRuntimeMachine<TRequest, TExtensionState> => {
  let machineState: WorkerRuntimeMachineState<TExtensionState> = {
    phase: 'running',
    extensionState: initialExtensionState
  };
  let shutdownResponsePromise: Promise<WorkerShutdownResponse> | null = null;
  let hasDisconnectedAfterShutdown = false;

  const resolveResponse = async (
    request: TRequest
  ): Promise<TResponse | WorkerShutdownResponse> => {
    if (request.subject === 'shutdown') {
      if (shutdownResponsePromise == null) {
        machineState = {
          ...machineState,
          phase: 'shutting-down'
        };
        shutdownResponsePromise = (async () => {
          const nextExtensionState = await onShutdown?.({
            extensionState: machineState.extensionState
          });

          if (nextExtensionState !== undefined) {
            machineState = {
              ...machineState,
              extensionState: nextExtensionState
            };
          }

          machineState = {
            ...machineState,
            phase: 'closed'
          };

          return createWorkerShutdownResponse();
        })();
      }

      return await shutdownResponsePromise;
    }

    if (machineState.phase !== 'running') {
      throw new Error(
        `next-slug-splitter ${workerLabel} is not accepting "${request.subject}" requests after shutdown has started.`
      );
    }

    const { response, nextExtensionState } =
      await dispatchWorkerRequestBySubject<
        TRequest,
        TResponse,
        TExtensionState,
        'shutdown'
      >({
        action: request as Exclude<TRequest, { subject: 'shutdown' }>,
        state: machineState.extensionState,
        handlers
      });

    if (nextExtensionState !== undefined) {
      machineState = {
        ...machineState,
        extensionState: nextExtensionState
      };
    }

    return response;
  };

  return {
    handleRequest: async (request: TRequest): Promise<void> => {
      await handleWorkerRuntimeRequest({
        workerLabel,
        request,
        resolveResponse,
        onSuccess: ({ request: handledRequest, response }) => {
          if (
            handledRequest.subject === 'shutdown' &&
            response.subject === 'shutdown-complete' &&
            !hasDisconnectedAfterShutdown
          ) {
            hasDisconnectedAfterShutdown = true;
            disconnectWorkerRuntimeProcess();
          }
        }
      });
    },
    getState: (): WorkerRuntimeMachineState<TExtensionState> => ({
      phase: machineState.phase,
      extensionState: machineState.extensionState
    })
  };
};
