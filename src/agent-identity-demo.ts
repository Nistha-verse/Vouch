import assert from 'node:assert/strict';

import { AGENT_STATUSES, AGENT_TYPES, createAgentIdentity } from './agent-identity.js';

const developer = createAgentIdentity({
  name: 'Developer Agent',
  type: 'developer',
  status: 'active',
});

const custom = createAgentIdentity({
  name: 'Custom Agent',
  type: 'custom',
  status: 'inactive',
});

assert.equal(developer.name, 'Developer Agent');
assert.equal(developer.type, 'developer');
assert.equal(developer.status, 'active');
assert.equal(custom.type, 'custom');
assert.equal(custom.status, 'inactive');
assert.notEqual(developer.agentId, custom.agentId);
assert.ok(/^agent-[0-9a-f]+$/.test(developer.agentId));
assert.ok(/^agent-[0-9a-f]+$/.test(custom.agentId));
assert.ok(!Number.isNaN(Date.parse(developer.createdAt)));
assert.ok(!Number.isNaN(Date.parse(custom.createdAt)));
assert.deepEqual(AGENT_TYPES, ['developer', 'research', 'task', 'custom']);
assert.deepEqual(AGENT_STATUSES, ['active', 'inactive', 'revoked']);

const developerKeys = Object.keys(developer);
assert.deepEqual(developerKeys, [
  'agentId',
  'name',
  'type',
  'status',
  'createdAt',
  'authorization',
]);
assert.equal(developer.authorization.status, 'unauthorized');
assert.equal('commitment' in developer.authorization, false);

for (const value of [developer, custom]) {
  assert.ok(!('ownerSecret' in value));
  assert.ok(!('agentSecret' in value));
  assert.ok(!('dailyLimit' in value));
  assert.ok(!('perTransactionLimit' in value));
  assert.ok(!('spentToday' in value));
  assert.ok(!('policy' in value));
}

console.log('Agent identity validation passed.');
console.log(JSON.stringify({ developer, custom }, null, 2));
