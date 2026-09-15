import type { WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

export type VouchPrivateState = {
  readonly dailyLimit: bigint;
  readonly perTransactionLimit: bigint;
  readonly spentToday: bigint;
  readonly ownerSecret: Uint8Array;
  readonly agentSecret: Uint8Array;
};

export const createVouchPrivateState = (
  state: VouchPrivateState,
): VouchPrivateState => ({
  dailyLimit: state.dailyLimit,
  perTransactionLimit: state.perTransactionLimit,
  spentToday: state.spentToday,
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
    [bigint, bigint, bigint],
  ] => [
    {
      ...privateState,
      spentToday: privateState.spentToday + amount,
    },
    [privateState.dailyLimit, privateState.perTransactionLimit, privateState.spentToday],
  ],
};