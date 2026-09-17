import assert from 'node:assert/strict';

import { AgentManager } from '../agent-manager.js';
import { createAgentIntent, type SpendAgentIntent } from '../agent-runtime/types.js';
import { AuthorizationService, type AuthorizationPolicy } from './index.js';

const manager = new AgentManager('owner-1');
const active = manager.create({ name: 'Authorized Spend Agent', type: 'task' });
const inactive = manager.create({ name: 'Inactive Agent', type: 'task' });
const unauthorized = manager.create({ name: 'Unauthorized Agent', type: 'task' });
assert.equal(active.ok, true);
assert.equal(inactive.ok, true);
assert.equal(unauthorized.ok, true);
if (!active.ok || !inactive.ok || !unauthorized.ok) throw new Error('Expected demo agents to be created.');

assert.equal(manager.authorizeAgent(active.value.agentId, 'commitment-active').ok, true);
assert.equal(manager.authorizeAgent(inactive.value.agentId, 'commitment-inactive').ok, true);
assert.equal(manager.activateAgent(active.value.agentId).ok, true);
assert.equal(manager.activateAgent(unauthorized.value.agentId).ok, true);

const mutablePolicy = {
  dailyLimit: 100n,
  perTransactionLimit: 60n,
  allowedCategories: ['tools'],
  allowedRecipients: ['recipient-allowed'],
};
const policy: AuthorizationPolicy = mutablePolicy;
const policyState = { policy, spentToday: 50n };
const secondPolicyState = {
  policy: { dailyLimit: 10n, perTransactionLimit: 10n },
  spentToday: 0n,
};
const service = new AuthorizationService(manager, new Map([
  [active.value.agentId, policyState],
  [inactive.value.agentId, { policy, spentToday: 0n }],
  [unauthorized.value.agentId, { policy, spentToday: 0n }],
]));

mutablePolicy.allowedCategories.push('travel');
mutablePolicy.allowedRecipients.push('recipient-other');
policyState.spentToday = 0n;

function spend(agentId: string, amount: bigint, category = 'tools', recipient = 'recipient-allowed'): SpendAgentIntent {
  const intent = createAgentIntent(agentId, {
    action: 'spend',
    amount,
    recipient,
    category,
    reason: 'Demo authorization check',
  });
  if (intent.action !== 'spend') throw new Error('Expected a spend intent.');
  return intent;
}

const allowed = service.authorize({ intent: spend(active.value.agentId, 50n) });
assert.equal(allowed.decision, 'allowed');
if (allowed.decision !== 'allowed') throw new Error('Expected a valid spend to be allowed.');
if (allowed.intent.action !== 'spend') throw new Error('Expected an allowed spend intent.');
assert.equal(allowed.intent.amount, 50n);
assert.match(allowed.reason, /pre-validation/i);

const inactiveDecision = service.authorize({ intent: spend(inactive.value.agentId, 1n) });
assert.equal(inactiveDecision.code, 'agent-inactive');

const unauthorizedDecision = service.authorize({ intent: spend(unauthorized.value.agentId, 1n) });
assert.equal(unauthorizedDecision.code, 'agent-not-authorized');
assert.equal(service.authorize({ intent: spend(active.value.agentId, 61n) }).code, 'per-transaction-limit');
assert.equal(service.authorize({ intent: spend(active.value.agentId, 51n) }).code, 'daily-limit');
assert.equal(service.authorize({ intent: spend(active.value.agentId, 1n, 'travel') }).code, 'category-not-allowed');
assert.equal(service.authorize({ intent: spend(active.value.agentId, 1n, 'tools', 'recipient-other') }).code, 'recipient-not-allowed');
const invalidAmountIntent = { ...spend(active.value.agentId, 1n), amount: 0n };
assert.equal(service.authorize({ intent: invalidAmountIntent }).code, 'invalid-amount');

const observe = service.authorize({
  intent: createAgentIntent(active.value.agentId, { action: 'observe', subject: 'service status' }),
});
assert.equal(observe.decision, 'allowed');

const second = manager.create({ name: 'Second Authorized Agent', type: 'task' });
assert.equal(second.ok, true);
if (!second.ok) throw new Error('Expected second demo agent to be created.');
assert.equal(manager.authorizeAgent(second.value.agentId, 'commitment-second').ok, true);
assert.equal(manager.activateAgent(second.value.agentId).ok, true);
const configuredPolicies = new Map([
  [active.value.agentId, policyState],
  [inactive.value.agentId, { policy, spentToday: 0n }],
  [second.value.agentId, secondPolicyState],
]);
const configuredService = new AuthorizationService(manager, configuredPolicies);
assert.equal('setPolicy' in configuredService, false);
assert.equal(configuredService.authorize({ intent: spend(second.value.agentId, 10n) }).decision, 'allowed');
assert.equal(configuredService.authorize({ intent: spend(active.value.agentId, 10n) }).decision, 'allowed');

const snapshot = spend(active.value.agentId, 5n);
const before = JSON.stringify({ ...snapshot, amount: snapshot.amount.toString() });
configuredService.authorize({ intent: snapshot });
assert.equal(JSON.stringify({ ...snapshot, amount: snapshot.amount.toString() }), before);

console.log('Authorization orchestration pre-validation passed.');
