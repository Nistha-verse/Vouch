import { strict as assert } from 'node:assert';
import { createApp } from '../src/server/app.js';
import { canonicalCategory, canonicalRecipient } from '../src/authorization/canonical.js';
import { commitmentForPolicyValue } from '../src/execution/midnight.js';
import { signingKeyFromBip340, signData, signatureVerifyingKey } from '@midnight-ntwrk/midnight-js-protocol/ledger';

async function run() {
  const { fastify, services } = createApp({ databasePath: ':memory:' });
  async function auth(seed: number) {
    const challengeResponse = await fastify.inject({ method: 'POST', url: '/api/auth/challenge' });
    const challenge = JSON.parse(challengeResponse.payload) as { challenge: string };
    const key = signingKeyFromBip340(new Uint8Array(32).fill(seed));
    const signature = signData(key, new TextEncoder().encode(challenge.challenge));
    const verified = await fastify.inject({
      method: 'POST', url: '/api/auth/verify',
      payload: { challenge: challenge.challenge, signature: { data: challenge.challenge, signature, verifyingKey: signatureVerifyingKey(key) } },
    });
    assert.equal(verified.statusCode, 200, verified.payload);
    const session = JSON.parse(verified.payload) as { token: string; userId: string };
    return { headers: { authorization: `Bearer ${session.token}` }, userId: session.userId };
  }
  const aliceSession = await auth(1);
  const bobSession = await auth(2);
  const alice = aliceSession.headers;
  const bob = bobSession.headers;
  assert.equal(canonicalRecipient('  vendor  '), 'vendor');
  assert.deepEqual(
    Buffer.from(commitmentForPolicyValue(canonicalRecipient('  vendor  '))).toString('hex'),
    '630ba09448af522154f38ef7685ef1f44b0f3e9430f80829a03ce24f400f3754',
  );
  assert.notDeepEqual(
    [...commitmentForPolicyValue(canonicalCategory('api'))],
    [...commitmentForPolicyValue('other-category')],
  );
  const create = await fastify.inject({ method: 'POST', url: '/api/agents', headers: alice, payload: { name: 'Persistent', type: 'task' } });
  assert.equal(create.statusCode, 201);
  const agent = JSON.parse(create.payload) as { agentId: string };
  assert.equal(services.agentManager.forUser(aliceSession.userId).authorizeAgent(agent.agentId, 'test-commitment').ok, true);

  assert.equal((await fastify.inject({ method: 'GET', url: '/api/agents', headers: bob })).payload, '[]');
  assert.equal((await fastify.inject({ method: 'GET', url: `/api/agents/${agent.agentId}`, headers: bob })).statusCode, 404);

  const policy = await fastify.inject({
    method: 'PUT', url: `/api/agents/${agent.agentId}/policy`, headers: alice,
    payload: { dailyLimit: '100', perTransactionLimit: '10', allowedCategories: ['api'], allowedRecipients: ['vendor'] },
  });
  assert.equal(policy.statusCode, 200);
  assert.equal((await fastify.inject({
    method: 'POST', url: '/api/authorization/execute', headers: alice,
    payload: {
      agentId: agent.agentId, kind: 'proposal', action: 'spend', amount: '1',
      recipient: 'vendor', category: 'api', reason: 'valid proposal',
      recipientCommitment: '00'.repeat(32), categoryCommitment: '11'.repeat(32),
    },
  })).statusCode, 400);

  assert.equal((await fastify.inject({ method: 'PUT', url: `/api/agents/${agent.agentId}/policy`, headers: bob, payload: { dailyLimit: '1', perTransactionLimit: '1' } })).statusCode, 404);

  assert.equal((await fastify.inject({ method: 'POST', url: `/api/agents/${agent.agentId}/activate`, headers: alice })).statusCode, 200);
  assert.equal((await fastify.inject({
    method: 'POST', url: '/api/authorization/check', headers: alice,
    payload: {
      agentId: agent.agentId, kind: 'proposal', action: 'spend', amount: '1',
      recipient: ' vendor ', category: ' api ', reason: 'valid proposal',
    },
  })).statusCode, 200);
  assert.equal((await fastify.inject({ method: 'POST', url: `/api/agents/${agent.agentId}/revoke`, headers: alice })).statusCode, 200);
  assert.equal((await fastify.inject({ method: 'POST', url: `/api/agents/${agent.agentId}/activate`, headers: alice })).statusCode, 400);

  const activity = await fastify.inject({ method: 'GET', url: `/api/agents/${agent.agentId}/activity`, headers: alice });
  assert.equal(activity.statusCode, 200);
  assert.ok(JSON.parse(activity.payload).length >= 3);
  assert.equal((await fastify.inject({ method: 'POST', url: '/api/agents', payload: { name: 'No identity' } })).statusCode, 401);
  await fastify.close();
  console.log('Backend persistence and ownership tests passed');
}

run().catch((error) => { console.error(error); process.exit(1); });
