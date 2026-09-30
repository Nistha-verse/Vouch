import assert from 'node:assert/strict';

import * as VouchPolicyContract from '../contracts/managed/vouch-policy/contract/index.js';
import { createVouchPrivateState, witnesses, type VouchPrivateState } from './vouch-policy-witnesses.js';

const commitment = (value: number): Uint8Array => Uint8Array.from({ length: 32 }, () => value);

const state: VouchPrivateState = {
  dailyLimit: 100n,
  perTransactionLimit: 25n,
  spentToday: 0n,
  ownerSecret: commitment(3),
  agentSecrets: [commitment(4), commitment(5), commitment(6), commitment(7)],
};

const copied = createVouchPrivateState(state);
assert.notEqual(copied, state);
assert.notEqual(copied.ownerSecret, state.ownerSecret);
assert.notEqual(copied.agentSecrets, state.agentSecrets);

assert.equal(typeof new VouchPolicyContract.Contract<VouchPrivateState>(witnesses).circuits.requestTaskSpend, 'function');

console.log('Vouch Compact contract interface and witness-state checks passed.');
console.log('Run npm run compile before this demo; real proof execution requires the configured Midnight node and proof server.');
