export type AgentType = 'developer' | 'research' | 'task' | 'custom';
export type AgentStatus = 'active' | 'inactive' | 'revoked';

export interface Agent {
  agentId: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  createdAt: string;
  authorization: { status: 'unauthorized' } | { status: 'authorized'; commitment: string };
}

export interface Proposal {
  kind: 'proposal';
  action: 'spend' | 'observe';
  agentId: string;
  amount?: string;
  recipient?: string;
  category?: string;
  reason?: string;
  subject?: string;
}

export interface ApiErrorShape {
  error?: { code?: string; message?: string };
  decision?: 'rejected';
  code?: string;
  reason?: string;
}

let sessionToken: string | null = null;

export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export function clearSessionToken(): void {
  setSessionToken(null);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // Only declare JSON when a body is present. Fastify rejects empty bodies with
  // content-type application/json (browser challenge/activate used to 400/500).
  if (init?.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  const response = await fetch(path, { ...init, headers });
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorShape;
  if (!response.ok) {
    if (response.status === 401) clearSessionToken();
    throw new Error(body.reason ?? body.error?.message ?? `Request failed (${response.status})`);
  }
  return body as T;
}

export const api = {
  challenge: () => request<{ challenge: string; expiresAt: string }>('/api/auth/challenge', { method: 'POST' }),
  verify: (challenge: string, signature: { data: string; signature: string; verifyingKey: string }) =>
    request<{ token: string; userId: string; expiresAt: string }>('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ challenge, signature }),
    }),
  listAgents: () => request<Agent[]>('/api/agents'),
  createAgent: (input: { name: string; type: AgentType }) =>
    request<Agent>('/api/agents', { method: 'POST', body: JSON.stringify(input) }),
  renameAgent: (id: string, name: string) =>
    request<Agent>(`/api/agents/${id}/rename`, { method: 'POST', body: JSON.stringify({ name }) }),
  lifecycle: (id: string, action: 'activate' | 'deactivate' | 'revoke') =>
    request<Agent>(`/api/agents/${id}/${action}`, { method: 'POST' }),
  propose: (id: string, task: AgentTask) =>
    request<Proposal>(`/api/agents/${id}/propose`, {
      method: 'POST',
      body: JSON.stringify(task),
    }),
  checkAuthorization: (proposal: Proposal) =>
    request<{ decision: 'allowed'; reason: string } | { decision: 'rejected'; reason: string }>(
      '/api/authorization/check',
      { method: 'POST', body: JSON.stringify(proposal) },
    ),
  execute: (proposal: Proposal) =>
    request<{ status: 'confirmed'; transactionId: string; contractAddress: string }>('/api/authorization/execute', {
      method: 'POST',
      body: JSON.stringify(proposal),
    }),
  policy: (id: string) => request<Policy>(`/api/agents/${id}/policy`),
  savePolicy: (id: string, policy: PolicyInput) =>
    request<Policy>(`/api/agents/${id}/policy`, { method: 'PUT', body: JSON.stringify(policy) }),
  activity: (id: string) => request<ActivityRecord[]>(`/api/agents/${id}/activity`),
};

export interface Policy {
  dailyLimit: string;
  perTransactionLimit: string;
  allowedCategories?: string[];
  allowedRecipients?: string[];
}
export type PolicyInput = Policy;
export interface ActivityRecord {
  id: number;
  userId: string;
  agentId: string;
  event: string;
  transactionId?: string;
  createdAt: string;
  metadata?: Record<string, string>;
}

export type AgentTask =
  | { action: 'observe'; subject: string }
  | { action: 'spend'; amount: string; recipient: string; category: string; reason: string };
