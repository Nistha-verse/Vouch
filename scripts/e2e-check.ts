import { strict as assert } from 'node:assert';
import { createApp } from '../src/server/app.js';
import {
  signData,
  signingKeyFromBip340,
  signatureVerifyingKey,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';

type Session = { headers: { authorization: string }; userId: string };

async function authenticate(fastify: Awaited<ReturnType<typeof createApp>>['fastify'], seed: number): Promise<Session> {
  const challengeResponse = await fastify.inject({ method: 'POST', url: '/api/auth/challenge' });
  assert.equal(challengeResponse.statusCode, 200);
  const challenge = JSON.parse(challengeResponse.payload) as { challenge: string };
  const key = signingKeyFromBip340(new Uint8Array(32).fill(seed));
  const signature = signData(key, new TextEncoder().encode(challenge.challenge));
  const response = await fastify.inject({
    method: 'POST',
    url: '/api/auth/verify',
    payload: {
      challenge: challenge.challenge,
      signature: {
        data: challenge.challenge,
        signature,
        verifyingKey: signatureVerifyingKey(key),
      },
    },
  });
  assert.equal(response.statusCode, 200, response.payload);
  const session = JSON.parse(response.payload) as { token: string; userId: string };
  return { headers: { authorization: `Bearer ${session.token}` }, userId: session.userId };
}

async function localApiFlow(): Promise<void> {
  const { fastify } = createApp({ databasePath: ':memory:' });
  try {
    const health = await fastify.inject({ method: 'GET', url: '/health' });
    assert.equal(health.statusCode, 200);

    const alice = await authenticate(fastify, 11);
    const bob = await authenticate(fastify, 12);
    const create = await fastify.inject({
      method: 'POST',
      url: '/api/agents',
      headers: alice.headers,
      payload: { name: 'E2E Spend Agent', type: 'task' },
    });
    assert.equal(create.statusCode, 201, create.payload);
    const agent = JSON.parse(create.payload) as { agentId: string };

    assert.equal((await fastify.inject({ method: 'GET', url: '/api/agents', headers: bob.headers })).payload, '[]');
    assert.equal((await fastify.inject({ method: 'POST', url: `/api/agents/${agent.agentId}/activate`, headers: alice.headers })).statusCode, 200);
    assert.equal((await fastify.inject({
      method: 'PUT',
      url: `/api/agents/${agent.agentId}/policy`,
      headers: alice.headers,
      payload: { dailyLimit: '10', perTransactionLimit: '5', allowedRecipients: ['vendor'], allowedCategories: ['api'] },
    })).statusCode, 200);

    const validProposal = {
      kind: 'proposal',
      agentId: agent.agentId,
      action: 'spend',
      amount: '2',
      recipient: ' vendor ',
      category: ' api ',
      reason: 'E2E policy-compliant proposal',
    };
    const allowed = await fastify.inject({ method: 'POST', url: '/api/authorization/check', headers: alice.headers, payload: validProposal });
    assert.equal(allowed.statusCode, 200, allowed.payload);

    const rejected = await fastify.inject({
      method: 'POST',
      url: '/api/authorization/check',
      headers: alice.headers,
      payload: { ...validProposal, amount: '6' },
    });
    assert.equal(rejected.statusCode, 403, rejected.payload);
    assert.match(rejected.payload, /per-transaction/i);

    const malformed = await fastify.inject({
      method: 'POST',
      url: '/api/authorization/check',
      headers: alice.headers,
      payload: { kind: 'proposal', agentId: agent.agentId, action: 'spend', amount: '2', recipient: 'vendor', category: 'api' },
    });
    assert.equal(malformed.statusCode, 400, malformed.payload);

    const commitments = await fastify.inject({
      method: 'POST',
      url: '/api/authorization/execute',
      headers: alice.headers,
      payload: { ...validProposal, recipientCommitment: '00'.repeat(32) },
    });
    assert.equal(commitments.statusCode, 400, commitments.payload);
  } finally {
    await fastify.close();
  }
}

async function liveApiFlow(): Promise<void> {
  const baseUrl = process.env.E2E_API_URL?.replace(/\/$/, '');
  const keyHex = process.env.VOUCH_E2E_SIGNING_KEY_HEX;
  const amount = process.env.E2E_AMOUNT;
  const recipient = process.env.E2E_RECIPIENT;
  const category = process.env.E2E_CATEGORY;
  const reason = process.env.E2E_REASON;
  if (!baseUrl || !keyHex || !/^[0-9a-f]{64}$/i.test(keyHex) || !amount || !recipient || !category || !reason) {
    throw new Error('VOUCH_E2E_LIVE=1 requires E2E_API_URL, a 32-byte VOUCH_E2E_SIGNING_KEY_HEX, E2E_AMOUNT, E2E_RECIPIENT, E2E_CATEGORY, and E2E_REASON.');
  }
  const get = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${baseUrl}${path}`, init);
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    assert.ok(response.ok, `${path} failed (${response.status}): ${JSON.stringify(body)}`);
    return body;
  };
  await get('/health');
  const challenge = await get('/api/auth/challenge', { method: 'POST' }) as { challenge: string };
  const key = signingKeyFromBip340(Uint8Array.from(Buffer.from(keyHex, 'hex')));
  const signature = signData(key, new TextEncoder().encode(challenge.challenge));
  const session = await get('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      challenge: challenge.challenge,
      signature: { data: challenge.challenge, signature, verifyingKey: signatureVerifyingKey(key) },
    }),
  }) as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const agent = await get('/api/agents', { headers }) as Array<{ agentId: string }>;
  const agentId = agent[0]?.agentId;
  if (!agentId) throw new Error('Live E2E wallet has no existing agent; create one through the authenticated app first.');
  const proposal = { kind: 'proposal', agentId, action: 'spend', amount, recipient, category, reason };
  const decision = await get('/api/authorization/check', { method: 'POST', headers, body: JSON.stringify(proposal) }) as { decision: string };
  assert.equal(decision.decision, 'allowed');
  const result = await get('/api/authorization/execute', { method: 'POST', headers, body: JSON.stringify(proposal) }) as { status: string; transactionId?: string };
  assert.equal(result.status, 'confirmed');
  assert.ok(result.transactionId, 'Live execution did not return a transaction ID.');
  console.log(`Live Preview execution confirmed transaction ${result.transactionId}.`);
}

async function main(): Promise<void> {
  await localApiFlow();
  console.log('Vouch API/auth/policy E2E checks passed.');

  if (process.env.VOUCH_E2E_LIVE === '1') {
    await liveApiFlow();
  } else {
    console.log('Live Preview execution skipped: set VOUCH_E2E_LIVE=1 with E2E_API_URL and VOUCH_E2E_SIGNING_KEY_HEX to run it explicitly.');
  }
}

main().catch((error) => {
  console.error(`Vouch E2E failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
