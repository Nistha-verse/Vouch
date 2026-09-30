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

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface NetworkInfo {
  network: 'preprod' | 'preview' | 'undeployed' | null;
  deployment: {
    address: string;
    transactionId?: string;
    deployedAt: string;
    deployer: string;
  } | null;
  /**
   * Kept for the health badge only. Transactions no longer wait on a backend
   * execution wallet: they are built/proved by the API and balanced, signed,
   * and submitted by the connected user's wallet.
   */
  execution?: 'syncing' | 'ready' | 'unavailable';
  executionError?: string;
}

/** An unbound transaction built by the backend, to be balanced/signed/submitted by the connected wallet. */
export interface PendingTransaction {
  pendingTransactionId: string;
  transactionKind: 'agent-authorization' | 'spend-authorization';
  /** Serialized `Transaction<SignatureEnabled, Proof, PreBinding>` in hex. */
  unboundTxHex: string;
  circuitId: string;
  contractAddress: string;
  expiresAt: string;
}

let sessionToken: string | null = null;

export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export function clearSessionToken(): void {
  setSessionToken(null);
}

async function request<T>(path: string, init?: RequestInit, agentToken?: string): Promise<T> {
  const headers = new Headers(init?.headers);
  // Only declare JSON when a body is present. Fastify rejects empty bodies with
  // content-type application/json (browser challenge/activate used to 400/500).
  if (init?.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  if (agentToken) headers.set('Authorization', `Vouch-Agent ${agentToken}`);
  const response = await fetch(path, { ...init, headers });
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorShape;
  if (!response.ok) {
    if (response.status === 401) clearSessionToken();
    throw new ApiRequestError(
      body.reason ?? body.error?.message ?? `The request failed with HTTP ${response.status}.`,
      response.status,
      body.code ?? body.error?.code,
    );
  }
  return body as T;
}

export const api = {
  network: () => request<NetworkInfo>('/api/network'),
  challenge: () => request<{ challenge: string; expiresAt: string }>('/api/auth/challenge', { method: 'POST' }),
  verify: (challenge: string, signature: { data: string; signature: string; verifyingKey: string }) =>
    request<{ token: string; userId: string; expiresAt: string }>('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ challenge, signature }),
    }),
  listAgents: () => request<Agent[]>('/api/agents'),
  createAgent: (input: { name: string; type: AgentType }) =>
    request<Agent>('/api/agents', { method: 'POST', body: JSON.stringify(input) }),
  issueAgentCredential: (id: string) =>
    request<{ agentId: string; credential: string; connectEndpoint: string }>(`/api/agents/${id}/credential`, { method: 'POST' }),
  connectCustomAgent: (agentId: string, credential: string) =>
    request<{ agentId: string; token: string; expiresAt: string }>('/api/custom-agent/connect', {
      method: 'POST',
      body: JSON.stringify({ agentId, credential }),
    }),
  customAgentPropose: (token: string, task: AgentTask) =>
    request<Proposal>('/api/custom-agent/propose', { method: 'POST', body: JSON.stringify(task) }, token),
  renameAgent: (id: string, name: string) =>
    request<Agent>(`/api/agents/${id}/rename`, { method: 'POST', body: JSON.stringify({ name }) }),
  lifecycle: (id: string, action: 'activate' | 'deactivate' | 'revoke') =>
    request<Agent>(`/api/agents/${id}/${action}`, { method: 'POST' }),
  /** Requests the unbound `authorize*Agent` transaction to approve in the wallet. */
  authorize: (id: string, walletKeys: { coinPublicKey: string; encryptionPublicKey: string }) =>
    request<{ status: 'pending-transaction'; pendingTransaction: PendingTransaction }>(`/api/agents/${id}/authorize`, {
      method: 'POST',
      body: JSON.stringify(walletKeys),
    }),
  /** Reports the wallet-submitted transaction ID; the backend verifies it on the Preprod indexer. */
  confirmAuthorize: (id: string, confirmation: { pendingTransactionId: string; transactionId: string }) =>
    request<{ status: 'confirmed'; transactionId: string }>(`/api/agents/${id}/authorize/confirm`, {
      method: 'POST',
      body: JSON.stringify(confirmation),
    }),
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
  /** Requests the first unbound transaction of the spend flow to approve in the wallet. */
  execute: (proposal: Proposal, walletKeys: { coinPublicKey: string; encryptionPublicKey: string }) =>
    request<{ status: 'pending-transaction'; pendingTransaction: PendingTransaction }>('/api/authorization/execute', {
      method: 'POST',
      body: JSON.stringify({ ...proposal, ...walletKeys }),
    }),
  /** Reports a wallet-submitted transaction ID; returns the next pending transaction until the flow completes. */
  confirmExecute: (confirmation: { pendingTransactionId: string; transactionId: string }) =>
    request<{ status: 'confirmed'; transactionId: string; contractAddress: string } | { status: 'pending-transaction'; pendingTransaction: PendingTransaction }>('/api/authorization/execute/confirm', {
      method: 'POST',
      body: JSON.stringify(confirmation),
    }),
  policy: (id: string) => request<Policy>(`/api/agents/${id}/policy`),
  savePolicy: (id: string, policy: PolicyInput) =>
    request<Policy>(`/api/agents/${id}/policy`, { method: 'PUT', body: JSON.stringify(policy) }),
  activity: (id: string) => request<ActivityRecord[]>(`/api/agents/${id}/activity`),
};

export interface Policy {
  dailyLimit: string;
  perTransactionLimit: string;
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
