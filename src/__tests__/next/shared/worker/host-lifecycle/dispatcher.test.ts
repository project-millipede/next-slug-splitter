import { describe, expect, test } from 'vitest';

import { dispatchWorkerHostLifecycleEventBySubject } from '../../../../../next/shared/worker/host-lifecycle/dispatcher';
import type { WorkerHostLifecycleEvent } from '../../../../../next/shared/worker/host-lifecycle/types';

type TestHostLifecycleEvent =
  | WorkerHostLifecycleEvent<'session-ready', { sessionKey: string }>
  | WorkerHostLifecycleEvent<'shutdown-requested', { reason: string }>;

describe('shared worker host lifecycle dispatcher', () => {
  test('routes lifecycle events by subject with narrowed payloads', async () => {
    const result = await dispatchWorkerHostLifecycleEventBySubject<
      TestHostLifecycleEvent,
      { traceId: string },
      string
    >({
      event: {
        subject: 'session-ready',
        payload: {
          sessionKey: 'alpha'
        }
      },
      context: {
        traceId: 'trace-1'
      },
      handlers: {
        'session-ready': async ({ event }) => event.payload.sessionKey,
        'shutdown-requested': async ({ event }) => event.payload.reason
      }
    });

    expect(result).toBe('alpha');
  });

  test('throws when no handler is registered for the event subject', async () => {
    await expect(
      dispatchWorkerHostLifecycleEventBySubject({
        event: {
          subject: 'unsupported-subject'
        },
        context: undefined,
        handlers: {}
      })
    ).rejects.toThrow(
      'next-slug-splitter host lifecycle has no handler for subject "unsupported-subject".'
    );
  });
});
