import { describe, expect, test, vi, type Mock } from 'vitest';

import { createAsyncGate } from '../../../../next/shared/async/async-gate';
import {
  runAsyncSequence,
  runAsyncSequenceAndWait,
  type AsyncSequenceInput,
  type AsyncSequenceWithWaitInput
} from '../../../../next/shared/async/async-sequence';

describe('shared async sequence helpers', () => {
  const BOOTSTRAPPED_RESULT = 'bootstrapped' as const;

  type SequenceResult = typeof BOOTSTRAPPED_RESULT;

  type SequenceEvent =
    | { type: 'execute' }
    | { type: 'resolve'; result: SequenceResult }
    | { type: 'reject'; message: string }
    | { type: 'wait' }
    | { type: 'ready' };

  type SequenceHookSpies = {
    resolve: Mock<AsyncSequenceInput<SequenceResult>['resolve']>;
    reject: Mock<AsyncSequenceInput<SequenceResult>['reject']>;
  };

  type SequenceOutcome =
    | { type: 'resolve'; result: SequenceResult }
    | { type: 'reject'; message: string };

  type SequenceScenario = {
    id: string;
    description: string;
    createInput: (
      hooks: SequenceHookSpies
    ) => AsyncSequenceInput<SequenceResult>;
    expected: SequenceOutcome;
    verifyHooks: (hooks: SequenceHookSpies) => void;
  };

  const originalFailure = new Error('bootstrap failed');
  const normalizedFailure = new Error('custom async-sequence failure');

  const sequenceScenarios: SequenceScenario[] = [
    {
      id: 'Resolve',
      description:
        'executes work, runs the success path, and returns the result',
      createInput: ({ resolve, reject }) => ({
        execute: async () => BOOTSTRAPPED_RESULT,
        resolve,
        reject
      }),
      expected: { type: 'resolve', result: BOOTSTRAPPED_RESULT },
      verifyHooks: ({ resolve, reject }) => {
        expect(resolve).toHaveBeenCalledWith(BOOTSTRAPPED_RESULT);
        expect(reject).not.toHaveBeenCalled();
      }
    },
    {
      id: 'Reject-Original',
      description:
        'runs the failure path with the original error and rethrows it',
      createInput: ({ resolve, reject }) => ({
        execute: async () => {
          throw originalFailure;
        },
        resolve,
        reject
      }),
      expected: { type: 'reject', message: 'bootstrap failed' },
      verifyHooks: ({ resolve, reject }) => {
        expect(resolve).not.toHaveBeenCalled();
        expect(reject).toHaveBeenCalledWith(originalFailure);
      }
    },
    {
      id: 'Reject-Normalized',
      description:
        'normalizes non-Error failures before running the failure path',
      createInput: ({ resolve, reject }) => ({
        execute: async () => {
          throw 'bootstrap failed';
        },
        resolve,
        reject,
        normalizeError: error =>
          error instanceof Error ? error : normalizedFailure
      }),
      expected: { type: 'reject', message: 'custom async-sequence failure' },
      verifyHooks: ({ resolve, reject }) => {
        expect(resolve).not.toHaveBeenCalled();
        expect(reject).toHaveBeenCalledWith(normalizedFailure);
        const [[normalizedError]] = reject.mock.calls;

        expect(normalizedError).toBeInstanceOf(Error);
      }
    }
  ];

  test.for(sequenceScenarios)(
    '[$id] $description',
    async ({ createInput, expected, verifyHooks }) => {
      // Keep the hook spies explicit so each scenario proves which path ran.
      const hooks: SequenceHookSpies = {
        resolve: vi.fn(async (_result: SequenceResult) => undefined),
        reject: vi.fn(async (_error: Error) => undefined)
      };
      const input = createInput(hooks);

      if (expected.type === 'reject') {
        await expect(runAsyncSequence(input)).rejects.toThrow(expected.message);
      } else {
        await expect(runAsyncSequence(input)).resolves.toBe(expected.result);
      }

      verifyHooks(hooks);
    }
  );

  type WaitScenario = {
    id: string;
    description: string;
    expectedEvents: SequenceEvent[];
  };

  const waitScenarios: WaitScenario[] = [
    {
      id: 'Boundary-First',
      description: 'waits on the external boundary before surfacing completion',
      expectedEvents: [
        { type: 'execute' },
        { type: 'wait' },
        { type: 'resolve', result: BOOTSTRAPPED_RESULT },
        { type: 'ready' }
      ]
    }
  ];

  test.for(waitScenarios)('[$id] $description', async ({ expectedEvents }) => {
    const readinessGate = createAsyncGate();
    const events: SequenceEvent[] = [];
    const input: AsyncSequenceWithWaitInput<SequenceResult> = {
      execute: async () => {
        events.push({ type: 'execute' });
        return BOOTSTRAPPED_RESULT;
      },
      resolve: async result => {
        events.push({ type: 'resolve', result });
        // The success path settles the shared external boundary later.
        readinessGate.resolve();
      },
      reject: async error => {
        events.push({ type: 'reject', message: error.message });
      },
      wait: async () => {
        events.push({ type: 'wait' });
        // The caller joins the shared boundary before it may observe completion.
        await readinessGate.wait();
        events.push({ type: 'ready' });
      }
    };

    await expect(runAsyncSequenceAndWait(input)).resolves.toBe(
      BOOTSTRAPPED_RESULT
    );
    expect(events).toEqual(expectedEvents);
  });
});
