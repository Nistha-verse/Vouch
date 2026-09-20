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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorShape;
  if (!response.ok) {
    throw new Error(body.reason ?? body.error?.message ?? `Request failed (${response.status})`);
  }
  return body as T;
}

export const api = {
  listAgents: () => request<Agent[]>('/api/agents'),
  createAgent: (input: { name: string; type: AgentType }) =>
    request<Agent>('/api/agents', { method: 'POST', body: JSON.stringify(input) }),
  renameAgent: (id: string, name: string) =>
    request<Agent>(`/api/agents/${id}/rename`, { method: 'POST', body: JSON.stringify({ name }) }),
  lifecycle: (id: string, action: 'activate' | 'deactivate' | 'revoke') =>
    request<Agent>(`/api/agents/${id}/${action}`, { method: 'POST' }),
  propose: (id: string, task: string) =>
    request<Proposal>(`/api/agents/${id}/propose`, {
      method: 'POST',
      body: JSON.stringify({ action: 'observe', subject: task }),
    }),
  checkAuthorization: (proposal: Proposal) =>
    request<{ decision: 'allowed'; reason: string } | { decision: 'rejected'; reason: string }>(
      '/api/authorization/check',
      { method: 'POST', body: JSON.stringify(proposal) },
    ),
};
