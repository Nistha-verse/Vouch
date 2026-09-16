import assert from 'node:assert/strict';

import {
  AGENT_TYPES,
  createAgentIdentity,
  getAgentCommitment,
  type AgentIdentity,
} from './agent-identity.js';
import { AgentManager } from './agent-manager.js';

const manager = new AgentManager('user-1');

const developer = manager.create({ name: 'Developer Agent', type: 'developer' });
assert.equal(developer.ok, true);
if (!developer.ok) throw new Error('Expected developer creation to succeed');
assert.equal(developer.value.type, 'developer');
assert.equal(developer.value.status, 'inactive');
assert.equal(developer.value.name, 'Developer Agent');
assert.ok(/^agent-[0-9a-f]+$/.test(developer.value.agentId));
assert.equal(developer.value.authorization.status, 'unauthorized');
assert.equal('commitment' in developer.value.authorization, false);
assert.equal(getAgentCommitment(developer.value), undefined);

const research = manager.create({ name: 'Research Agent', type: 'research' });
assert.equal(research.ok, true);
if (!research.ok) throw new Error('Expected research creation to succeed');
assert.equal(research.value.status, 'inactive');

const custom = manager.create({ name: 'Custom Agent', type: 'custom' });
assert.equal(custom.ok, true);
if (!custom.ok) throw new Error('Expected custom creation to succeed');
assert.equal(custom.value.status, 'inactive');

const all = manager.listAgents();
assert.equal(all.length, 3);
assert.equal(new Set(all.map((agent) => agent.agentId)).size, all.length);

assert.notEqual(developer.value.agentId, research.value.agentId);
assert.notEqual(developer.value.agentId, custom.value.agentId);
assert.notEqual(research.value.agentId, custom.value.agentId);

const renamed = manager.renameAgent(developer.value.agentId, 'Developer Agent Renamed');
assert.equal(renamed.ok, true);
if (!renamed.ok) throw new Error('Expected rename to succeed');
assert.equal(renamed.value.name, 'Developer Agent Renamed');

const activated = manager.activateAgent(developer.value.agentId);
assert.equal(activated.ok, true);
if (!activated.ok) throw new Error('Expected activation to succeed');
assert.equal(activated.value.status, 'active');

const deactivated = manager.deactivateAgent(developer.value.agentId);
assert.equal(deactivated.ok, true);
if (!deactivated.ok) throw new Error('Expected deactivation to succeed');
assert.equal(deactivated.value.status, 'inactive');

const revoked = manager.revokeAgent(developer.value.agentId);
assert.equal(revoked.ok, true);
if (!revoked.ok) throw new Error('Expected revocation to succeed');
assert.equal(revoked.value.status, 'revoked');

const blockedReactivation = manager.activateAgent(developer.value.agentId);
assert.equal(blockedReactivation.ok, false);
if (blockedReactivation.ok) throw new Error('Reactivation should be rejected');
assert.equal(blockedReactivation.error.code, 'agent-revoked');

const invalidName = manager.create({ name: '   ', type: 'developer' });
assert.equal(invalidName.ok, false);
if (invalidName.ok) throw new Error('Invalid empty name should fail');
assert.equal(invalidName.error.code, 'invalid-name');

const invalidType = manager.create({ name: 'Bad Agent', type: 'unknown' as never });
assert.equal(invalidType.ok, false);
if (invalidType.ok) throw new Error('Invalid type should fail');
assert.equal(invalidType.error.code, 'invalid-type');

const authorizationCandidate = manager.create({ name: 'Authorization Agent', type: 'task' });
assert.equal(authorizationCandidate.ok, true);
if (!authorizationCandidate.ok) throw new Error('Expected candidate creation to succeed');

const unauthorizedCommitmentAttempt = manager.authorizeAgent(authorizationCandidate.value.agentId, '   ');
assert.equal(unauthorizedCommitmentAttempt.ok, false);
if (unauthorizedCommitmentAttempt.ok) throw new Error('Empty commitment should be rejected');
assert.equal(unauthorizedCommitmentAttempt.error.code, 'invalid-authorization');

const authorized = manager.authorizeAgent(authorizationCandidate.value.agentId, '0xdeadbeef');
assert.equal(authorized.ok, true);
if (!authorized.ok) throw new Error('Authorization should succeed with a real commitment');
assert.equal(authorized.value.authorization.status, 'authorized');
assert.equal(authorized.value.authorization.commitment, '0xdeadbeef');
assert.equal(getAgentCommitment(authorized.value), '0xdeadbeef');

const noAIs = manager.listAgents().every((agent) => {
  return !('apiKey' in agent) && !('model' in agent) && !('llm' in agent) && !('runtime' in agent);
});
assert.equal(noAIs, true);

const noSecrets = manager.listAgents().every((agent) => {
  return !('seedPhrase' in agent)
    && !('privateKey' in agent)
    && !('ownerSecret' in agent)
    && !('agentSecret' in agent)
    && !('policy' in agent)
    && !('financialState' in agent)
    && !('ledgerState' in agent);
});
assert.equal(noSecrets, true);

const byId = manager.getAgent(custom.value.agentId);
assert.ok(byId);
assert.equal(byId?.name, 'Custom Agent');
assert.equal(byId?.type, 'custom');

const duplicate = manager.create({ name: 'Duplicate Name', type: 'task' });
assert.equal(duplicate.ok, true);
if (!duplicate.ok) throw new Error('Duplicate name is allowed in a registry');
const duplicateId = manager.getAgent(duplicate.value.agentId);
assert.ok(duplicateId);

const identityCheck = createAgentIdentity({
  name: 'Seed Agent',
  type: 'developer',
  status: 'inactive',
});
assert.equal(identityCheck.status, 'inactive');
assert.equal(identityCheck.authorization.status, 'unauthorized');
assert.equal('commitment' in identityCheck.authorization, false);
assert.ok(AGENT_TYPES.includes(identityCheck.type));

console.log('Agent creation validation passed.');
console.log(JSON.stringify({
  developer: developer.value,
  research: research.value,
  custom: custom.value,
  allCount: all.length,
}, null, 2));
