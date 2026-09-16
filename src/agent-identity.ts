export const AGENT_TYPES = ['developer', 'research', 'task', 'custom'] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const AGENT_STATUSES = ['active', 'inactive', 'revoked'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export interface AgentIdentity {
  readonly agentId: string;
  readonly name: string;
  readonly type: AgentType;
  readonly status: AgentStatus;
  readonly createdAt: string;
  readonly authorizedAgentCommitment: string;
}

export interface CreateAgentIdentityInput {
  readonly name: string;
  readonly type?: AgentType;
  readonly status?: AgentStatus;
  readonly authorizedAgentCommitment: string;
}

function stableHash(value: string): number {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createAgentIdentity(input: CreateAgentIdentityInput): AgentIdentity {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Agent name is required.');
  }

  const type = input.type ?? 'custom';
  if (!AGENT_TYPES.includes(type)) {
    throw new Error(`Unsupported agent type: ${String(type)}`);
  }

  const status = input.status ?? 'active';
  if (!AGENT_STATUSES.includes(status)) {
    throw new Error(`Unsupported agent status: ${String(status)}`);
  }

  const createdAt = new Date().toISOString();
  const agentIdSeed = `${name}|${createdAt}|${input.authorizedAgentCommitment}`;
  const uniqueHash = stableHash(agentIdSeed);

  return {
    agentId: `agent-${uniqueHash.toString(16).padStart(8, '0')}`,
    name,
    type,
    status,
    createdAt,
    authorizedAgentCommitment: input.authorizedAgentCommitment,
  };
}
