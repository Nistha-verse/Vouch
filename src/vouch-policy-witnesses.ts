import type { WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

export type VouchPrivateState = {
  readonly dailyLimit: bigint;
  readonly perTransactionLimit: bigint;
  readonly spentToday: bigint;
  readonly allowedRecipientCommitment: Uint8Array;
  readonly allowedCategoryCommitment: Uint8Array;
  readonly ownerSecret: Uint8Array;
  readonly agentSecret: Uint8Array;
};

export const createVouchPrivateState = (
  state: VouchPrivateState,
): VouchPrivateState => ({
  dailyLimit: state.dailyLimit,
  perTransactionLimit: state.perTransactionLimit,
  spentToday: state.spentToday,
  allowedRecipientCommitment: new Uint8Array(state.allowedRecipientCommitment),
  allowedCategoryCommitment: new Uint8Array(state.allowedCategoryCommitment),
  ownerSecret: new Uint8Array(state.ownerSecret),
  agentSecret: new Uint8Array(state.agentSecret),
});

export const witnesses = {
  getOwnerSecret: ({
    privateState,
  }: WitnessContext<unknown, VouchPrivateState>): [VouchPrivateState, Uint8Array] => [
    privateState,
    privateState.ownerSecret,
  ],
  getAgentSecret: ({
    privateState,
  }: WitnessContext<unknown, VouchPrivateState>): [VouchPrivateState, Uint8Array] => [
    privateState,
    privateState.agentSecret,
  ],
  getPolicy: ({
    privateState,
  }: WitnessContext<unknown, VouchPrivateState>, amount: bigint): [
    VouchPrivateState,
    [bigint, bigint, bigint, Uint8Array, Uint8Array],
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
      privateState.allowedRecipientCommitment,
      privateState.allowedCategoryCommitment,
    ],
  ],
};