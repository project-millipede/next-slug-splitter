import { describe, expect, test } from 'vitest';

import { dispatchSharedWorkerRequestBySubject } from '../../../../../next/shared/worker/runtime/dispatcher';
import type {
  SharedWorkerRequestAction,
  SharedWorkerShutdownRequest
} from '../../../../../next/shared/worker/types';

type DispatcherTestRequest =
  | SharedWorkerRequestAction<'bootstrap', { generation: string }>
  | SharedWorkerRequestAction<'resolve-lazy-miss', { pathname: string }>
  | SharedWorkerShutdownRequest;

type DispatcherTestResponse =
  | {
      subject: 'bootstrapped';
      payload: {
        generation: string;
      };
    }
  | {
      subject: 'lazy-miss-resolved';
      payload: {
        pathname: string;
      };
    };

describe('shared worker runtime dispatcher', () => {
  test('routes one request by subject with typed payload access', async () => {
    const result = await dispatchSharedWorkerRequestBySubject<
      DispatcherTestRequest,
      DispatcherTestResponse,
      { handled: Array<string> },
      'shutdown'
    >({
      action: {
        requestId: 'request-1',
        subject: 'bootstrap',
        payload: {
          generation: 'generation-1'
        }
      },
      state: {
        handled: []
      },
      handlers: {
        bootstrap: async ({ action, state }) => ({
          response: {
            subject: 'bootstrapped',
            payload: {
              generation: action.payload.generation
            }
          },
          nextExtensionState: {
            handled: [...state.handled, action.subject]
          }
        }),
        'resolve-lazy-miss': async ({ action, state }) => ({
          response: {
            subject: 'lazy-miss-resolved',
            payload: {
              pathname: action.payload.pathname
            }
          },
          nextExtensionState: {
            handled: [...state.handled, action.subject]
          }
        })
      }
    });

    expect(result).toEqual({
      response: {
        subject: 'bootstrapped',
        payload: {
          generation: 'generation-1'
        }
      },
      nextExtensionState: {
        handled: ['bootstrap']
      }
    });
  });

  test('fails for unsupported subjects', async () => {
    await expect(
      dispatchSharedWorkerRequestBySubject<
        DispatcherTestRequest,
        DispatcherTestResponse,
        { handled: Array<string> },
        'shutdown'
      >({
        action: {
          requestId: 'request-1',
          subject: 'unknown-subject',
          payload: {
            value: 'unexpected'
          }
        } as unknown as Exclude<DispatcherTestRequest, { subject: 'shutdown' }>,
        state: {
          handled: []
        },
        handlers: {
          bootstrap: async ({ action, state }) => ({
            response: {
              subject: 'bootstrapped',
              payload: {
                generation: action.payload.generation
              }
            },
            nextExtensionState: state
          }),
          'resolve-lazy-miss': async ({ action, state }) => ({
            response: {
              subject: 'lazy-miss-resolved',
              payload: {
                pathname: action.payload.pathname
              }
            },
            nextExtensionState: state
          })
        }
      })
    ).rejects.toThrow(
      'next-slug-splitter worker runtime does not support subject "unknown-subject".'
    );
  });
});
