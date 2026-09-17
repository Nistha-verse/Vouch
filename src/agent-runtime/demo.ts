import assert from 'node:assert/strict';

import { BuiltInAgentRuntime } from './builtin-runtime.js';
import { CustomAgentRuntime } from './custom-runtime.js';
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

console.log('Agent runtime validation passed.');
console.log(JSON.stringify({
  builtIn: builtIn.getMetadata(),
  custom: custom.getMetadata(),
  intent: { ...intent, amount: intent.action === 'spend' ? intent.amount.toString() : undefined },
}, null, 2));