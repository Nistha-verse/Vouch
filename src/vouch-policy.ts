import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import * as VouchPolicyContract from '../contracts/managed/vouch-policy/contract/index.js';
import { witnesses, type VouchPrivateState } from './vouch-policy-witnesses.js';

export { createVouchPrivateState, type VouchPrivateState } from './vouch-policy-witnesses.js';

export const compiledVouchPolicy = CompiledContract.make<
  VouchPolicyContract.Contract<VouchPrivateState>,
  VouchPrivateState
>('vouch-policy', VouchPolicyContract.Contract<VouchPrivateState>).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets('./contracts/managed/vouch-policy'),
);