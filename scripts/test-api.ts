import { strict as assert } from 'node:assert';
import { createApp } from '../src/server/app.js';

async function run() {
  const { fastify } = createApp();

  // Health
  const health = await fastify.inject({ method: 'GET', url: '/health' });
  assert.equal(health.statusCode, 200);
  const h = JSON.parse(health.payload);
  assert.equal(h.status, 'ok');

  // Create agent
  const create = await fastify.inject({ method: 'POST', url: '/api/agents', payload: { name: 'TestAgent', type: 'developer' } });
  assert.equal(create.statusCode, 201, `create failed: ${create.payload}`);
  const agent = JSON.parse(create.payload);
  assert.ok(agent.agentId, 'no agentId');

  // List
  const list = await fastify.inject({ method: 'GET', url: '/api/agents' });
  assert.equal(list.statusCode, 200);
  const arr = JSON.parse(list.payload);
  assert.ok(Array.isArray(arr) && arr.length >= 1);

  // Get agent
  const get = await fastify.inject({ method: 'GET', url: `/api/agents/${agent.agentId}` });
  assert.equal(get.statusCode, 200);

  // Activate
  const activate = await fastify.inject({ method: 'POST', url: `/api/agents/${agent.agentId}/activate` });
  assert.equal(activate.statusCode, 200);
  const activated = JSON.parse(activate.payload);
  assert.equal(activated.status, 'active');

  // Authorization malformed amount
  const badAmount = await fastify.inject({ method: 'POST', url: '/api/authorization/check', payload: { agentId: agent.agentId, kind: 'proposal', action: 'spend', amount: '1.23', recipient: 'x', category: 'y', reason: 'z' } });
  assert.equal(badAmount.statusCode, 400);

  // Spend is rejected when no authorization policy allows the agent.
  const authorization = await fastify.inject({
    method: 'POST',
    url: '/api/authorization/check',
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
  const unknown = await fastify.inject({ method: 'POST', url: '/api/authorization/check', payload: { agentId: 'agent-unknown', kind: 'proposal', action: 'observe', subject: 'x' } });
  assert.equal(unknown.statusCode, 403);

  console.log('All API smoke tests passed');
  await fastify.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
