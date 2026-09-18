import assert from 'node:assert/strict';
import { AgentManager } from '../agent-manager.js';
import { createAgentIntent } from '../agent-runtime/types.js';
import { AuthorizationService } from '../authorization/index.js';
import { getOrCreateWallet, resolveNetwork } from '../network.js';
import { createWallet, persistWalletState } from '../wallet.js';
import { loadVouchPrivateState } from './config.js';
import { createVouchExecutionService } from './service.js';
import { VouchExecutionError } from './types.js';

const { network, config } = resolveNetwork();
const privateState = loadVouchPrivateState();
const manager = new AgentManager('local-execution-demo');
const created = manager.create({ name: 'Local Execution Agent', type: 'task' });
assert.equal(created.ok, true);
if (!created.ok) throw new Error('Unable to create the execution demo agent.');
assert.equal(manager.authorizeAgent(created.value.agentId, 'application-marker').ok, true);
assert.equal(manager.activateAgent(created.value.agentId).ok, true);

const authorization = new AuthorizationService(manager, new Map([
  [created.value.agentId, {
    policy: {
      dailyLimit: privateState.dailyLimit,
      perTransactionLimit: privateState.dailyLimit,
      allowedRecipients: ['local-recipient'],
      allowedCategories: ['local-category'],
    },
    spentToday: 0n,
  }],
]));

const walletRecord = getOrCreateWallet(network);
const wallet = await createWallet({ network, networkConfig: config, seed: walletRecord.seed });
try {
  await wallet.wallet.waitForSyncedState();
  await persistWalletState(network, wallet);
  const execution = await createVouchExecutionService(authorization, network, config, wallet);
  const intent = createAgentIntent(created.value.agentId, {
    action: 'spend',
    amount: 1n,
    recipient: 'local-recipient',
    category: 'local-category',
    reason: 'Real Midnight execution demo',
  });

  const result = await execution.authorizeSpend({
    intent,
    recipientCommitment: privateState.allowedRecipientCommitment,
    categoryCommitment: privateState.allowedCategoryCommitment,
  });
  assert.equal(result.status, 'confirmed');
  console.log(`Vouch authorization confirmed on Midnight.`);
  console.log(`Contract: ${result.contractAddress}`);
  console.log(`Transaction: ${result.transactionId}`);

  const rejectedIntent = createAgentIntent(created.value.agentId, {
    action: 'spend',
    amount: privateState.perTransactionLimit + 1n,
    recipient: 'local-recipient',
    category: 'local-category',
    reason: 'Real Compact rejection demo',
  });
  try {
    await execution.authorizeSpend({
      intent: rejectedIntent,
      recipientCommitment: privateState.allowedRecipientCommitment,
      categoryCommitment: privateState.allowedCategoryCommitment,
    });
    throw new Error('Compact unexpectedly accepted an over-limit authorization.');
  } catch (error) {
    if (error instanceof VouchExecutionError) {
      assert.ok(
        error.code === 'transaction-rejected' || error.code === 'execution-failed',
        `Unexpected Vouch execution error code: ${error.code}`,
      );
      console.log(`Over-limit authorization was rejected by Midnight (${error.code}).`);
    } else {
      throw error;
    }
  }
} finally {
  await wallet.wallet.stop();
}
