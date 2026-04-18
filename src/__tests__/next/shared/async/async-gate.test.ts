import { describe, expect, test } from 'vitest';

import type {
  AsyncGate,
  AsyncGateStoreOptions,
  AsyncGateStore
} from '../../../../next/shared/async/async-gate';
import {
  createAsyncGate,
  createAsyncGateStore
} from '../../../../next/shared/async/async-gate';

describe('shared async gate helpers', () => {
  const GATE_FAILURE_MESSAGE = 'gate failed' as const;
  const OWNER_GATE_FAILURE_MESSAGE = 'owner gate failed' as const;
  const MISSING_GATE_ERROR_MESSAGE = 'missing gate' as const;
  const DUPLICATE_GATE_ERROR_MESSAGE = 'duplicate gate' as const;

  describe('createAsyncGate', () => {
    type GateSettlementScenario = {
      id: string;
      description: string;
      settle: (gate: AsyncGate) => void;
      expectedError?: string;
    };

    const gateSettlementScenarios: GateSettlementScenario[] = [
      {
        id: 'Resolve',
        description: 'wait resolves after external successful settlement',
        settle: gate => {
          // The external owner publishes successful completion here.
          gate.resolve();
        }
      },
      {
        id: 'Reject',
        description: 'wait rejects with the provided error',
        settle: gate => {
          // The external owner publishes failed completion here.
          gate.reject(new Error(GATE_FAILURE_MESSAGE));
        },
        expectedError: GATE_FAILURE_MESSAGE
      }
    ];

    test.for(gateSettlementScenarios)(
      '[$id] $description',
      async ({ settle, expectedError }) => {
        const gate = createAsyncGate();

        // Start waiting first so the scenario proves later external settlement.
        const waitPromise = gate.wait();

        settle(gate);

        if (expectedError) {
          await expect(waitPromise).rejects.toThrow(expectedError);
          return;
        }

        await expect(waitPromise).resolves.toBeUndefined();
      }
    );

    test('ignores repeated settle calls after the first successful settlement', async () => {
      const gate = createAsyncGate();

      gate.resolve();

      expect(() => {
        gate.resolve();
        gate.reject(new Error('ignored'));
      }).not.toThrow();
      await expect(gate.wait()).resolves.toBeUndefined();
    });
  });

  describe('createAsyncGateStore', () => {
    type StoreSettlementScenario = {
      id: string;
      description: string;
      settle: (gateStore: AsyncGateStore<object>, owner: object) => void;
      expectedError?: string;
    };

    const storeSettlementScenarios: StoreSettlementScenario[] = [
      {
        id: 'Resolve',
        description: 'wait resolves after the owner-selected gate resolves',
        settle: (gateStore, owner) => {
          // Resolve the gate selected by this exact owner identity.
          gateStore.resolve(owner);
        }
      },
      {
        id: 'Reject',
        description: 'wait rejects after the owner-selected gate rejects',
        settle: (gateStore, owner) => {
          // Reject the gate selected by this exact owner identity.
          gateStore.reject(owner, new Error(OWNER_GATE_FAILURE_MESSAGE));
        },
        expectedError: OWNER_GATE_FAILURE_MESSAGE
      }
    ];

    test.for(storeSettlementScenarios)(
      '[$id] $description',
      async ({ settle, expectedError }) => {
        const gateStore = createAsyncGateStore<object>();
        const owner = {};

        gateStore.initialize(owner);

        // The store test proves owner lookup and gate settlement target the
        // same gate instance.
        const waitPromise = gateStore.wait(owner);

        // Each scenario settles the owner-scoped gate after registration.
        settle(gateStore, owner);

        if (expectedError) {
          await expect(waitPromise).rejects.toThrow(expectedError);
          return;
        }

        await expect(waitPromise).resolves.toBeUndefined();
      }
    );

    type MissingOwnerScenario = {
      id: string;
      description: string;
      access: (
        gateStore: AsyncGateStore<object>,
        owner: object
      ) => Promise<void> | void;
      expectedMode: 'rejects' | 'throws';
    };

    const missingOwnerScenarios: MissingOwnerScenario[] = [
      {
        id: 'Wait',
        description: 'wait rejects for one owner without a registered gate',
        access: async (gateStore, owner) => {
          await gateStore.wait(owner);
        },
        expectedMode: 'rejects'
      },
      {
        id: 'Resolve',
        description: 'resolve throws for one owner without a registered gate',
        access: (gateStore, owner) => {
          gateStore.resolve(owner);
        },
        expectedMode: 'throws'
      },
      {
        id: 'Reject',
        description: 'reject throws for one owner without a registered gate',
        access: (gateStore, owner) => {
          gateStore.reject(owner, new Error('ignored'));
        },
        expectedMode: 'throws'
      }
    ];

    test.for(missingOwnerScenarios)(
      '[$id] $description',
      async ({ access, expectedMode }) => {
        const options: AsyncGateStoreOptions = {
          missingGateErrorMessage: MISSING_GATE_ERROR_MESSAGE
        };
        const gateStore = createAsyncGateStore<object>(options);
        const owner = {};

        if (expectedMode === 'rejects') {
          // `wait(...)` is async, so missing-owner access rejects rather than throws.
          await expect(access(gateStore, owner)).rejects.toThrow(
            MISSING_GATE_ERROR_MESSAGE
          );
          return;
        }

        // `resolve(...)` and `reject(...)` fail synchronously during owner lookup.
        expect(() => {
          void access(gateStore, owner);
        }).toThrow(MISSING_GATE_ERROR_MESSAGE);
      }
    );

    test('throws when the same owner initializes twice', () => {
      const options: AsyncGateStoreOptions = {
        alreadyInitializedErrorMessage: DUPLICATE_GATE_ERROR_MESSAGE
      };
      const gateStore = createAsyncGateStore<object>(options);
      const owner = {};

      gateStore.initialize(owner);

      expect(() => {
        gateStore.initialize(owner);
      }).toThrow(DUPLICATE_GATE_ERROR_MESSAGE);
    });
  });
});
