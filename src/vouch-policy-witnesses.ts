import type { WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

export type VouchPrivateState = {
  readonly dailyLimit: bigint;
  readonly perTransactionLimit: bigint;
  readonly spentToday: bigint;
  readonly ownerSecret: Uint8Array;
  readonly agentSecrets: readonly [Uint8Array, Uint8Array, Uint8Array, Uint8Array];
};

export const createVouchPrivateState = (
  state: VouchPrivateState,
): VouchPrivateState => ({
  dailyLimit: state.dailyLimit,
  perTransactionLimit: state.perTransactionLimit,
  spentToday: state.spentToday,
  ownerSecret: new Uint8Array(state.ownerSecret),
  agentSecrets: [
    new Uint8Array(state.agentSecrets[0]),
    new Uint8Array(state.agentSecrets[1]),
    new Uint8Array(state.agentSecrets[2]),
    new Uint8Array(state.agentSecrets[3]),
  ],
});

export const witnesses = {
  getOwnerSecret: ({
    privateState,
  }: WitnessContext<unknown, VouchPrivateState>): [VouchPrivateState, Uint8Array] => [
    privateState,
    privateState.ownerSecret,
  ],
  getTaskAgentSecret: ({
    privateState,
  }: WitnessContext<unknown, VouchPrivateState>): [VouchPrivateState, Uint8Array] => [privateState, privateState.agentSecrets[0]],
  getResearchAgentSecret: ({ privateState }: WitnessContext<unknown, VouchPrivateState>): [VouchPrivateState, Uint8Array] => [privateState, privateState.agentSecrets[1]],
  getDeveloperAgentSecret: ({ privateState }: WitnessContext<unknown, VouchPrivateState>): [VouchPrivateState, Uint8Array] => [privateState, privateState.agentSecrets[2]],
  getCustomAgentSecret: ({ privateState }: WitnessContext<unknown, VouchPrivateState>): [VouchPrivateState, Uint8Array] => [privateState, privateState.agentSecrets[3]],
  getPolicy: ({
    privateState,
  }: WitnessContext<unknown, VouchPrivateState>, amount: bigint): [
    VouchPrivateState,
    [bigint, bigint, bigint],
  ] => [
    // Midnight.js persists this next private state only when the enclosing
    // transaction succeeds. It is private client state, not a globally shared
    // ledger, so callers must not treat it as concurrency-safe accounting.
    {
      ...privateState,
      spentToday: privateState.spentToday + amount,
    },
    [
      privateState.dailyLimit,
      privateState.perTransactionLimit,
      privateState.spentToday,
    ],
  ],
};