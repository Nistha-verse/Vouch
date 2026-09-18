import assert from 'node:assert/strict';

import * as VouchPolicyContract from '../contracts/managed/vouch-policy/contract/index.js';
import { createVouchPrivateState, witnesses, type VouchPrivateState } from './vouch-policy-witnesses.js';

const commitment = (value: number): Uint8Array => Uint8Array.from({ length: 32 }, () => value);

const state: VouchPrivateState = {
  dailyLimit: 100n,
  perTransactionLimit: 25n,
  spentToday: 0n,
  allowedRecipientCommitment: commitment(1),
  allowedCategoryCommitment: commitment(2),
  ownerSecret: commitment(3),
  agentSecret: commitment(4),
};

const copied = createVouchPrivateState(state);
assert.notEqual(copied, state);
assert.notEqual(copied.allowedRecipientCommitment, state.allowedRecipientCommitment);
assert.notEqual(copied.allowedCategoryCommitment, state.allowedCategoryCommitment);
assert.notEqual(copied.ownerSecret, state.ownerSecret);
assert.notEqual(copied.agentSecret, state.agentSecret);

assert.equal(typeof new VouchPolicyContract.Contract<VouchPrivateState>(witnesses).circuits.requestSpend, 'function');

console.log('Vouch Compact contract interface and witness-state checks passed.');
console.log('Run npm run compile before this demo; real proof execution requires the configured Midnight node and proof server.');
