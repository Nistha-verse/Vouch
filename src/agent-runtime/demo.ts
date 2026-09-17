import assert from 'node:assert/strict';

import { BuiltInAgentRuntime } from './builtin-runtime.js';
import { CustomAgentRuntime } from './custom-runtime.js';
import { GroqRuntimeError } from './errors.js';
import { GroqBuiltInAgentRuntime } from './groq-runtime.js';
import type { GroqClient } from './groq-client.js';
import type { AgentRuntime } from './runtime.js';

const builtIn: AgentRuntime = new BuiltInAgentRuntime('agent-built-in-demo');
const task = {
  action: 'spend' as const,
  amount: '125000' as const,
  recipient: 'recipient-1',
  category: 'tools',
  reason: 'Purchase development tools',
};

const intent = await builtIn.receiveTask(task);
assert.equal(intent.action, 'spend');
assert.equal(intent.kind, 'proposal');
assert.equal(intent.agentId, 'agent-built-in-demo');
if (intent.action !== 'spend') throw new Error('Expected a spend proposal.');
assert.equal(intent.amount, 125000n);
assert.equal(typeof intent.amount, 'bigint');
assert.equal('authorization' in intent, false);
assert.equal('wallet' in builtIn, false);
assert.equal('privateKey' in builtIn, false);
assert.equal('seed' in builtIn, false);
assert.equal('apiKey' in builtIn, false);
assert.equal(builtIn.getMetadata().provider, 'deterministic-development');

await assert.rejects(
  builtIn.receiveTask({ ...task, amount: 0n }),
  /greater than zero/,
);
await assert.rejects(
  builtIn.receiveTask({ ...task, amount: -1n }),
  /greater than zero/,
);
await assert.rejects(
  builtIn.receiveTask({ ...task, amount: 1.5 }),
  /bigint or a decimal integer string/,
);
await assert.rejects(
  builtIn.receiveTask({ ...task, amount: Number.MAX_SAFE_INTEGER + 1 }),
  /bigint or a decimal integer string/,
);

const custom: AgentRuntime = new CustomAgentRuntime('agent-custom-demo', {
  async propose() {
    return task;
  },
});
const customIntent = await custom.receiveTask(task);
assert.equal(customIntent.agentId, 'agent-custom-demo');
assert.equal(custom.getMetadata().provider, 'external-adapter');
assert.equal('wallet' in custom, false);

const validModelProposal = JSON.stringify({
  action: 'spend',
  amount: '2',
  recipient: 'recipient-from-model',
  category: 'tools',
  reason: 'A model-proposed purchase',
  agentId: 'model-cannot-set-this-id',
});

function fakeGroqClient(response: string | Error): GroqClient {
  return {
    async complete() {
      if (response instanceof Error) {
        throw response;
      }
      return response;
    },
  };
}

function fakeRuntime(response: string | Error): GroqBuiltInAgentRuntime {
  return new GroqBuiltInAgentRuntime('agent-trusted-id', fakeGroqClient(response), 'test-model');
}

function hasErrorCode(code: GroqRuntimeError['code']) {
  return (error: unknown): boolean => error instanceof GroqRuntimeError && error.code === code;
}

const originalGroqApiKey = process.env.GROQ_API_KEY;
delete process.env.GROQ_API_KEY;
assert.throws(
  () => new GroqBuiltInAgentRuntime('agent-missing-key'),
  hasErrorCode('missing-api-key'),
);
if (originalGroqApiKey === undefined) {
  delete process.env.GROQ_API_KEY;
} else {
  process.env.GROQ_API_KEY = originalGroqApiKey;
}

const groqRuntime = fakeRuntime(validModelProposal);
const groqIntent = await groqRuntime.receiveTask(task);
assert.equal(groqIntent.kind, 'proposal');
assert.equal(groqIntent.agentId, 'agent-trusted-id');
assert.equal(groqIntent.action, 'spend');
if (groqIntent.action !== 'spend') throw new Error('Expected a Groq spend proposal.');
assert.equal(groqIntent.amount, 2n);
assert.equal(groqIntent.recipient, 'recipient-from-model');
assert.equal('authorization' in groqIntent, false);
assert.equal('wallet' in groqRuntime, false);
assert.equal('submitTransaction' in groqRuntime, false);
assert.equal('privateKey' in groqIntent, false);
assert.equal('seed' in groqIntent, false);
assert.equal('apiKey' in groqIntent, false);
assert.equal(groqRuntime.getMetadata().provider, 'groq');

const invalidOutputs: Array<[string, string]> = [
  [JSON.stringify({ action: 'spend', amount: '1.5', recipient: 'r', category: 'c', reason: 'r' }), 'decimal amount'],
  [JSON.stringify({ action: 'spend', amount: '-1', recipient: 'r', category: 'c', reason: 'r' }), 'negative amount'],
  [JSON.stringify({ action: 'spend', amount: '0', recipient: 'r', category: 'c', reason: 'r' }), 'zero amount'],
  [JSON.stringify({ action: 'spend', amount: 1.5, recipient: 'r', category: 'c', reason: 'r' }), 'number amount'],
  [JSON.stringify({ action: 'spend', amount: '1e2', recipient: 'r', category: 'c', reason: 'r' }), 'exponent amount'],
  [JSON.stringify({ action: 'spend', amount: '1', recipient: '', category: 'c', reason: 'r' }), 'empty recipient'],
  [JSON.stringify({ action: 'spend', amount: '1', recipient: 'r', category: '', reason: 'r' }), 'empty category'],
  [JSON.stringify({ action: 'spend', amount: '1', recipient: 'r', category: 'c', reason: '' }), 'empty reason'],
  [JSON.stringify({ action: 'spend', amount: '1', recipient: 'r', category: 'x'.repeat(65), reason: 'r' }), 'long category'],
  [JSON.stringify({ action: 'spend', amount: '1', recipient: 'r', category: 'c', reason: 'x'.repeat(501) }), 'long reason'],
];

for (const [response, label] of invalidOutputs) {
  await assert.rejects(fakeRuntime(response).receiveTask(task), hasErrorCode('invalid-spend-intent'), label);
}
await assert.rejects(fakeRuntime('{not-json').receiveTask(task), hasErrorCode('invalid-model-response'));
await assert.rejects(fakeRuntime(JSON.stringify({ action: 'unsupported' })).receiveTask(task), hasErrorCode('invalid-model-response'));
await assert.rejects(fakeRuntime(new Error('simulated provider failure')).receiveTask(task), hasErrorCode('groq-request-failed'));

console.log('Agent runtime validation passed.');
console.log(JSON.stringify({
  builtIn: builtIn.getMetadata(),
  custom: custom.getMetadata(),
  intent: { ...intent, amount: intent.action === 'spend' ? intent.amount.toString() : undefined },
}, null, 2));