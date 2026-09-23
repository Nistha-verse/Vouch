import { strict as assert } from 'node:assert';
import { createApp } from '../src/server/app.js';
import { signingKeyFromBip340, signData, signatureVerifyingKey } from '@midnight-ntwrk/midnight-js-protocol/ledger';

async function run() {
  const { fastify } = createApp({ databasePath: ':memory:' });
  const challengeResponse = await fastify.inject({ method: 'POST', url: '/api/auth/challenge' });
  const challenge = JSON.parse(challengeResponse.payload) as { challenge: string };
  const key = signingKeyFromBip340(new Uint8Array(32).fill(7));
  const signature = signData(key, new TextEncoder().encode(challenge.challenge));
  const verified = await fastify.inject({
    method: 'POST',
    url: '/api/auth/verify',
    payload: {
      challenge: challenge.challenge,
      signature: { data: challenge.challenge, signature, verifyingKey: signatureVerifyingKey(key) },
    },
  });
  assert.equal(verified.statusCode, 200, verified.payload);
  const headers = { authorization: `Bearer ${(JSON.parse(verified.payload) as { token: string }).token}` };

  // Health
  const health = await fastify.inject({ method: 'GET', url: '/health' });
  assert.equal(health.statusCode, 200);
  const h = JSON.parse(health.payload);
  assert.equal(h.status, 'ok');

  // Create agent
  const create = await fastify.inject({ method: 'POST', url: '/api/agents', headers, payload: { name: 'TestAgent', type: 'developer' } });
  assert.equal(create.statusCode, 201, `create failed: ${create.payload}`);
  const agent = JSON.parse(create.payload);
  assert.ok(agent.agentId, 'no agentId');

  // List
  const list = await fastify.inject({ method: 'GET', url: '/api/agents', headers });
  assert.equal(list.statusCode, 200);
  const arr = JSON.parse(list.payload);
  assert.ok(Array.isArray(arr) && arr.length >= 1);

  // Get agent
  const get = await fastify.inject({ method: 'GET', url: `/api/agents/${agent.agentId}`, headers });
  assert.equal(get.statusCode, 200);

  // Activate
  const activate = await fastify.inject({ method: 'POST', url: `/api/agents/${agent.agentId}/activate`, headers });
  assert.equal(activate.statusCode, 200, activate.payload);
  const activated = JSON.parse(activate.payload);
  assert.equal(activated.status, 'active');

  // Authorization malformed amount
  const badAmount = await fastify.inject({ method: 'POST', url: '/api/authorization/check', headers, payload: { agentId: agent.agentId, kind: 'proposal', action: 'spend', amount: '1.23', recipient: 'x', category: 'y', reason: 'z' } });
  assert.equal(badAmount.statusCode, 400);

  // Spend is rejected when no authorization policy allows the agent.
  const authorization = await fastify.inject({
    method: 'POST',
    url: '/api/authorization/check',
    headers,
    payload: {
      agentId: agent.agentId,
      kind: 'proposal',
      action: 'spend',
      amount: '2',
      recipient: 'x',
      category: 'y',
      reason: 'z',
    },
  });
  assert.equal(authorization.statusCode, 403);

  // Missing agent in authorization
  const unknown = await fastify.inject({ method: 'POST', url: '/api/authorization/check', headers, payload: { agentId: 'agent-unknown', kind: 'proposal', action: 'observe', subject: 'x' } });
  assert.equal(unknown.statusCode, 404);

  console.log('All API smoke tests passed');
  await fastify.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
