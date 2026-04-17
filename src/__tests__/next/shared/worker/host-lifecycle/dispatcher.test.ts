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
      string
    >(
      {
        subject: 'session-ready',
        payload: {
          sessionKey: 'alpha'
        }
      },
      {
        'session-ready': async ({ event }) => event.payload.sessionKey,
        'shutdown-requested': async ({ event }) => event.payload.reason
      }
    );

    expect(result).toBe('alpha');
  });

  test('throws when the event subject is unsupported', async () => {
    await expect(
      dispatchWorkerHostLifecycleEventBySubject(
        {
          subject: 'unsupported-subject'
        },
        {}
      )
    ).rejects.toThrow(
      'next-slug-splitter host lifecycle does not support subject "unsupported-subject".'
    );
  });
});
