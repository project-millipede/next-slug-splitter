import type { JsonValue } from '../../../utils/type-guards-json';
import type {
  WorkerRequestAction,
  WorkerResponseAction,
  WorkerResponseEnvelope,
  WorkerShutdownRequest,
  WorkerShutdownResponse
} from '../../shared/worker/types';

/**
 * Payload for one App page-data compile request.
 */
type AppPageDataCompileRequestPayload = {
  /**
   * Stable target identifier used for diagnostics and logging.
   */
  targetId: string;
  /**
   * Resolved runtime path to the compiler module chosen by config.
   */
  compilerModulePath: string;
  /**
   * Serializable compiler input payload passed through unchanged.
   */
  input: JsonValue;
};

/**
 * Request action used to compile one page-data payload in the isolated worker.
 */
export type AppPageDataCompileRequest = WorkerRequestAction<
  'compile-page-data',
  AppPageDataCompileRequestPayload
>;

/**
 * One IPC request sent from the lightweight App page-data compiler host into
 * the isolated worker process.
 */
export type AppPageDataWorkerRequest =
  | AppPageDataCompileRequest
  | WorkerShutdownRequest;

/**
 * Payload returned after successfully compiling one page-data payload.
 */
type AppPageDataCompiledResponsePayload = {
  /**
   * Serializable compile result returned by the app-owned compiler module.
   */
  result: JsonValue;
};

/**
 * Successful compile response returned by the App page-data worker.
 */
export type AppPageDataCompiledResponse = WorkerResponseAction<
  'page-data-compiled',
  AppPageDataCompiledResponsePayload
>;

/**
 * Successful App page-data worker response payload.
 */
export type AppPageDataWorkerResponse =
  | AppPageDataCompiledResponse
  | WorkerShutdownResponse;

/**
 * Request/response pair carried by the App page-data worker protocol.
 */
export type AppPageDataWorkerExchange =
  | {
      /**
       * Request variant sent to the worker.
       */
      request: AppPageDataCompileRequest;
      /**
       * Successful response paired with the request variant.
       */
      response: AppPageDataCompiledResponse;
    }
  | {
      /**
       * Request variant sent to the worker.
       */
      request: WorkerShutdownRequest;
      /**
       * Successful response paired with the request variant.
       */
      response: WorkerShutdownResponse;
    };

/**
 * Successful response type paired with one App page-data worker request.
 *
 * @template TRequest Concrete App page-data worker request variant.
 */
export type AppPageDataWorkerExchangeResponse<
  TRequest extends AppPageDataWorkerExchange['request']
> = Extract<AppPageDataWorkerExchange, { request: TRequest }>['response'];

/**
 * Outer IPC response envelope used by the App page-data worker.
 */
export type AppPageDataWorkerResponseEnvelope =
  WorkerResponseEnvelope<AppPageDataWorkerResponse>;
