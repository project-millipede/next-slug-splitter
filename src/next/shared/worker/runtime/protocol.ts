import process from 'node:process';
import type {
  SharedWorkerAnyRequestAction,
  SharedWorkerResponseEnvelope
} from '../types';

/**
 * Shared worker-runtime IPC protocol helpers.
 *
 * @remarks
 * This module owns only the mechanical request/response transport that both
 * long-lived worker runtimes need:
 * - validate the IPC-capable worker runtime contract
 * - send serialized success and error envelopes back to the host process
 * - wrap one request so failures are narrowed to request-scoped error
 *   responses instead of collapsing the whole worker session immediately
 *
 * Worker-family request semantics intentionally stay out of this layer.
 * The shared action protocol is:
 * - requests carry `requestId` plus `subject`
 * - successful responses carry `subject`
 * - business data travels under `payload`
 */

export type SharedWorkerRuntimeResponseEnvelope<TResponse> =
  SharedWorkerResponseEnvelope<TResponse>;

/**
 * Validate that the current worker process was spawned with an IPC channel.
 *
 * @param workerLabel - Human-readable worker label used in the error message.
 * @returns `void` when the worker can speak to its parent over IPC.
 */
export const assertSharedWorkerRuntimeIpcChannel = (
  workerLabel: string
): void => {
  if (typeof process.send !== 'function') {
    throw new Error(`next-slug-splitter ${workerLabel} requires an IPC channel.`);
  }
};

/**
 * Send one response envelope back to the parent process over IPC.
 *
 * @remarks
 * Transport aspects:
 * - Channel: protocol traffic uses Node IPC instead of stdout.
 * - Separation: app-owned stdout/stderr activity remains outside the request
 *   protocol.
 * - Validation: the worker requires an IPC-capable spawn contract.
 *
 * @param input - Response-writing input.
 */
export const writeSharedWorkerRuntimeResponse = async <TResponse>({
  workerLabel,
  response
}: {
  workerLabel: string;
  response: SharedWorkerResponseEnvelope<TResponse>;
}): Promise<void> =>
  new Promise((resolve, reject) => {
    if (typeof process.send !== 'function') {
      reject(
        new Error(`next-slug-splitter ${workerLabel} requires an IPC channel.`)
      );
      return;
    }

    process.send(response, error => {
      if (error != null) {
        reject(error);
        return;
      }

      resolve();
    });
  });

/**
 * Handle one worker request through the shared response-envelope protocol.
 *
 * @remarks
 * Request-handling aspects:
 * - The worker-family resolver owns request semantics and returns the compact
 *   success payload for that request.
 * - Each request is answered independently over IPC with either a success or
 *   error envelope.
 * - Post-success hooks can perform worker-family lifecycle steps such as a
 *   shutdown exit only after the acknowledgement has been written.
 *
 * @param input - Request-handling input.
 * @returns `void` after the request has been fully answered.
 */
export const handleSharedWorkerRuntimeRequest = async <
  TRequest extends SharedWorkerAnyRequestAction,
  TResponse
>({
  workerLabel,
  request,
  resolveResponse,
  onSuccess
}: {
  workerLabel: string;
  request: TRequest;
  resolveResponse: (request: TRequest) => Promise<TResponse>;
  onSuccess?: (input: { request: TRequest; response: TResponse }) => Promise<void> | void;
}): Promise<void> => {
  try {
    const response = await resolveResponse(request);

    await writeSharedWorkerRuntimeResponse({
      workerLabel,
      response: {
        requestId: request.requestId,
        ok: true,
        response
      }
    });

    await onSuccess?.({
      request,
      response
    });
  } catch (error) {
    try {
      await writeSharedWorkerRuntimeResponse({
        workerLabel,
        response: {
          requestId: request.requestId,
          ok: false,
          error: {
            message: error instanceof Error ? error.message : String(error)
          }
        }
      });
    } catch {
      // If the IPC channel is already unavailable there is no narrower
      // recovery path left for this request.
    }
  }
};
