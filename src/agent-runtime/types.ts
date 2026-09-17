export type SpendAmountInput = bigint | number | string;

export interface SpendTask {
  readonly action: 'spend';
  readonly amount: SpendAmountInput;
  readonly recipient: string;
  readonly category: string;
  readonly reason: string;
}

export interface ObserveTask {
  readonly action: 'observe';
  readonly subject: string;
}

export type AgentTask = SpendTask | ObserveTask;

export interface SpendIntentInput {
  readonly action: 'spend';
  readonly amount: SpendAmountInput;
  readonly recipient: string;
  readonly category: string;
  readonly reason: string;
}

export interface ObserveIntentInput {
  readonly action: 'observe';
  readonly subject: string;
}

export type AgentIntentInput = SpendIntentInput | ObserveIntentInput;

export interface SpendAgentIntent {
  readonly kind: 'proposal';
  readonly action: 'spend';
  readonly amount: bigint;
  readonly recipient: string;
  readonly category: string;
  readonly reason: string;
  readonly agentId: string;
}

export interface ObserveAgentIntent {
  readonly kind: 'proposal';
  readonly action: 'observe';
  readonly subject: string;
  readonly agentId: string;
}

export type AgentIntent = SpendAgentIntent | ObserveAgentIntent;

export type AgentRuntimeKind = 'built-in' | 'custom';
export type AgentRuntimeStatus = 'ready' | 'processing' | 'stopped';

export interface AgentRuntimeMetadata {
  readonly kind: AgentRuntimeKind;
  readonly provider: 'deterministic-development' | 'external-adapter' | 'groq';
  readonly status: AgentRuntimeStatus;
}

function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required.`);
  }
  return trimmed;
}

export function normalizeSpendAmount(amount: SpendAmountInput): bigint {
  if (typeof amount === 'number') {
    throw new Error('Spend amounts must be bigint or a decimal integer string, not a number.');
  }

  if (typeof amount === 'string' && !/^(0|[1-9][0-9]*)$/.test(amount)) {
    throw new Error('Spend amount must be a non-negative decimal integer string.');
  }

  let normalized: bigint;
  try {
    normalized = typeof amount === 'bigint' ? amount : BigInt(amount);
  } catch {
    throw new Error('Spend amount is not a valid integer.');
  }

  if (normalized <= 0n) {
    throw new Error('Spend amount must be greater than zero.');
  }

  return normalized;
}

export function createAgentIntent(agentId: string, input: AgentIntentInput): AgentIntent {
  const normalizedAgentId = requireText(agentId, 'Agent ID');

  if (input.action === 'spend') {
    return {
      kind: 'proposal',
      action: 'spend',
      amount: normalizeSpendAmount(input.amount),
      recipient: requireText(input.recipient, 'Recipient'),
      category: requireText(input.category, 'Category'),
      reason: requireText(input.reason, 'Reason'),
      agentId: normalizedAgentId,
    };
  }

  return {
    kind: 'proposal',
    action: 'observe',
    subject: requireText(input.subject, 'Subject'),
    agentId: normalizedAgentId,
  };
}