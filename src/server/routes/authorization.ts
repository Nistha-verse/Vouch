import type { FastifyInstance } from 'fastify';
import type { AgentManager } from '../../agent-manager.js';
import { AuthorizationService } from '../../authorization/service.js';
import type { AuthorizationPolicy } from '../../authorization/types.js';
import type { VouchExecutionAdapter } from '../../execution/service.js';
import { VouchExecutionError } from '../../execution/types.js';
import type { AgentRepository } from '../../persistence/database.js';
import type { AgentIdentity } from '../../agent-identity.js';
import { scopedManager, userId } from '../request-context.js';
import { canonicalCategory, canonicalRecipient } from '../../authorization/canonical.js';
import type { WalletAuthService } from '../auth.js';

const decimal = /^[1-9][0-9]*$/;
const MAX_TRANSACTION_ID_LENGTH = 128;

function privateSecretsForAgent(type: AgentIdentity['type'], secret: Uint8Array): [Uint8Array, Uint8Array, Uint8Array, Uint8Array] {
  const secrets: [Uint8Array, Uint8Array, Uint8Array, Uint8Array] = [
    new Uint8Array(32),
    new Uint8Array(32),
    new Uint8Array(32),
    new Uint8Array(32),
  ];
  secrets[{ task: 0, research: 1, developer: 2, custom: 3 }[type]] = new Uint8Array(secret);
  return secrets;
}

function amount(value: unknown): bigint {
  if (typeof value !== 'string' || !decimal.test(value) || value.length > 78) throw new Error('Amount must be a positive decimal integer string.');
  return BigInt(value);
}

function policyInput(value: unknown): AuthorizationPolicy {
  if (!value || typeof value !== 'object') throw new Error('Policy is required.');
  const input = value as Record<string, unknown>;
  if (input.dailyLimit === undefined || input.perTransactionLimit === undefined) throw new Error('Policy limits are required.');
  const dailyLimit = amount(input.dailyLimit);
  const perTransactionLimit = amount(input.perTransactionLimit);
  if (perTransactionLimit > dailyLimit) throw new Error('Per-transaction limit cannot exceed daily limit.');
  if ('allowedCategories' in input || 'allowedRecipients' in input) {
    throw new Error('Recipient and category allowlists are not supported; Vouch enforces wallet-safety limits only.');
  }
  return { dailyLimit, perTransactionLimit };
}

function intent(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') throw new Error('Malformed proposal.');
  const value = body as Record<string, unknown>;
  if ('recipientCommitment' in value || 'categoryCommitment' in value) throw new Error('Client-supplied commitments are not accepted.');
  if (value.kind !== 'proposal' || typeof value.agentId !== 'string' || (value.action !== 'spend' && value.action !== 'observe')) throw new Error('Malformed proposal.');
  if (value.action === 'spend' && (typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 500)) throw new Error('Spend proposal reason is required.');
  return {
    ...value,
    ...(value.action === 'spend'
      ? {
        amount: amount(value.amount),
        recipient: canonicalRecipient(value.recipient),
        category: canonicalCategory(value.category),
      }
      : {}),
  };
}

/**
 * Public keys of the connected user's wallet from the DApp connector's
 * `getShieldedAddresses()`. They are public values used to build a transaction
 * that belongs to the user's wallet; no secret material is accepted here.
 */
function browserKeys(value: unknown): { coinPublicKey: string; encryptionPublicKey: string } {
  if (!value || typeof value !== 'object') throw new Error('The connected wallet’s public keys are required.');
  const input = value as Record<string, unknown>;
  if (typeof input.coinPublicKey !== 'string' || input.coinPublicKey.trim().length < 8) throw new Error('The connected wallet’s coin public key is missing or malformed.');
  if (typeof input.encryptionPublicKey !== 'string' || input.encryptionPublicKey.trim().length < 8) throw new Error('The connected wallet’s encryption public key is missing or malformed.');
  return { coinPublicKey: input.coinPublicKey.trim(), encryptionPublicKey: input.encryptionPublicKey.trim() };
}

function confirmInput(value: unknown): { pendingTransactionId: string; transactionId: string } {
  if (!value || typeof value !== 'object') throw new Error('A pending transaction ID and submitted transaction ID are required.');
  const input = value as Record<string, unknown>;
  if (typeof input.pendingTransactionId !== 'string' || input.pendingTransactionId.trim() === '' || input.pendingTransactionId.length > 128) {
    throw new Error('The pending transaction ID is missing or malformed.');
  }
  if (typeof input.transactionId !== 'string' || input.transactionId.trim() === '' || input.transactionId.length > MAX_TRANSACTION_ID_LENGTH) {
    throw new Error('The submitted transaction ID is missing or malformed.');
  }
  return { pendingTransactionId: input.pendingTransactionId.trim(), transactionId: input.transactionId.trim() };
}

export type ExecutionStateProvider = () => {
  status: 'syncing' | 'ready' | 'unavailable';
  error?: string;
  execution?: VouchExecutionAdapter;
};

function executionUnavailable(execState: ReturnType<ExecutionStateProvider>) {
  return {
    code: 'execution-not-available' as const,
    statusCode: 503 as const,
    message: execState.status === 'unavailable'
      ? `Midnight execution is unavailable: ${execState.error ?? 'Service failed to initialize.'}`
      : 'Midnight execution is still initializing. Agent and policy management remain available.',
  };
}

export function registerAuthorizationRoutes(
  fastify: FastifyInstance,
  manager: AgentManager,
  repository: AgentRepository,
  getExecutionState: ExecutionStateProvider,
  auth: WalletAuthService,
) {
  const getAuthorization = (owner: string, agentId: string) => {
    const scoped = manager.forUser(owner);
    const state = repository.getPolicy(owner, agentId);
    return new AuthorizationService(scoped, state ? new Map([[agentId, state]]) : new Map());
  };

  fastify.get('/api/agents/:agentId/policy', async (request, reply) => {
    const owner = userId(request, reply, auth);
    if (!owner) return;
    const { agentId } = request.params as { agentId: string };
    if (!manager.forUser(owner).getAgent(agentId)) return reply.status(404).send({ error: { code: 'agent-not-found', message: 'Agent was not found.' } });
    const state = repository.getPolicy(owner, agentId);
    return state ? { ...state.policy, dailyLimit: state.policy.dailyLimit.toString(), perTransactionLimit: state.policy.perTransactionLimit.toString() } : reply.status(404).send({ error: { code: 'policy-not-found', message: 'Policy was not found.' } });
  });

  // ─── Agent authorization: browser-wallet split ──────────────────────────────
  //
  // POST /authorize builds and proves the authorize*Agent unbound transaction
  // server-side (using server-held secrets only) and returns it. The browser
  // balances/signs/submits it through the connected wallet and reports the
  // derived transaction ID to POST /authorize/confirm, which watches the
  // Preprod indexer, then updates application state.

  fastify.post('/api/agents/:agentId/authorize', async (request, reply) => {
    const owner = userId(request, reply, auth);
    if (!owner) return;
    const { agentId } = request.params as { agentId: string };
    const agent = manager.forUser(owner).getAgent(agentId);
    if (!agent) return reply.status(404).send({ error: { code: 'agent-not-found', message: 'Agent was not found.' } });
    if (agent.authorization.status === 'authorized') {
      return reply.status(409).send({ error: { code: 'agent-already-authorized', message: 'This agent is already authorized.' } });
    }
    const occupied = repository.findAuthorizedAgentByType(agent.type);
    if (occupied && occupied.agent.agentId !== agentId) {
      return reply.status(409).send({
        error: {
          code: 'contract-agent-slot-occupied',
          message: `The deployed Vouch contract has one ${agent.type} agent slot, already used by ${occupied.agent.name}. Multiple simultaneous agents of the same type require a different contract deployment.`,
        },
      });
    }
    const agentSecret = manager.forUser(owner).getAgentSecret(agentId);
    if (!agentSecret) return reply.status(500).send({ error: { code: 'agent-identity-unavailable', message: 'Agent private identity is unavailable.' } });
    if (!repository.claimContractAgentSlot(agent.type, owner, agentId)) {
      return reply.status(409).send({
        error: {
          code: 'contract-agent-slot-occupied',
          message: `The deployed Vouch contract has one ${agent.type} agent slot. Multiple simultaneous agents of the same type require a different contract deployment.`,
        },
      });
    }
    let keys;
    try {
      keys = browserKeys(request.body);
    } catch (error) {
      repository.releaseContractAgentSlot(agent.type, owner, agentId);
      return reply.status(400).send({ error: { code: 'invalid-request', message: error instanceof Error ? error.message : 'The connected wallet’s public keys are required.' } });
    }
    const execState = getExecutionState();
    if (!execState.execution) {
      repository.releaseContractAgentSlot(agent.type, owner, agentId);
      const unavailable = executionUnavailable(execState);
      return reply.status(unavailable.statusCode).send({ error: { code: unavailable.code, message: unavailable.message } });
    }
    try {
      const pendingTransaction = await execState.execution.createAgentAuthorizationTransaction({
        userId: owner,
        agentId,
        agentType: agent.type,
        agentSecret,
        browserKeys: keys,
      });
      return {
        status: 'pending-transaction',
        pendingTransaction,
      };
    } catch (error) {
      repository.releaseContractAgentSlot(agent.type, owner, agentId);
      request.log.error(error);
      return reply.status(502).send({ error: { code: 'authorization-failed', message: error instanceof Error ? error.message : 'Midnight authorization failed.' } });
    }
  });

  fastify.post('/api/agents/:agentId/authorize/confirm', async (request, reply) => {
    const owner = userId(request, reply, auth);
    if (!owner) return;
    const { agentId } = request.params as { agentId: string };
    let confirmation;
    try {
      confirmation = confirmInput(request.body);
    } catch (error) {
      return reply.status(400).send({ error: { code: 'invalid-request', message: error instanceof Error ? error.message : 'Confirmation request is invalid.' } });
    }
    const execState = getExecutionState();
    if (!execState.execution) {
      const unavailable = executionUnavailable(execState);
      return reply.status(unavailable.statusCode).send({ error: { code: unavailable.code, message: unavailable.message } });
    }
    const execution = execState.execution;
    try {
      const outcome = await execution.confirmPendingTransaction(confirmation.pendingTransactionId, confirmation.transactionId);
      if (outcome.status === 'pending-transaction') {
        return reply.status(400).send({ error: { code: 'invalid-request', message: 'This confirmation endpoint does not accept a follow-up transaction.' } });
      }
      if (outcome.flow !== 'agent-authorization' || outcome.userId !== owner || outcome.agentId !== agentId) {
        return reply.status(404).send({ error: { code: 'pending-transaction-not-found', message: 'The pending transaction was not found.' } });
      }
      manager.forUser(owner).authorizeAgent(outcome.agentId, outcome.agentCommitmentHex);
      repository.addActivity({ userId: owner, agentId: outcome.agentId, event: 'agent-authorized', transactionId: outcome.transactionId });
      return { status: 'confirmed', transactionId: outcome.transactionId };
    } catch (error) {
      // The pending transaction is kept so the user can retry the confirmation
      // (the slot stays claimed for the same owner/agent while it is alive;
      // claimContractAgentSlot is idempotent for the same claimant).
      request.log.error(error);
      const message = error instanceof VouchExecutionError
        ? error.message
        : error instanceof Error ? error.message : 'Midnight authorization failed.';
      return reply.status(502).send({ error: { code: 'authorization-failed', message } });
    }
  });

  fastify.put('/api/agents/:agentId/policy', async (request, reply) => {
    const owner = userId(request, reply, auth);
    if (!owner) return;
    const { agentId } = request.params as { agentId: string };
    if (!manager.forUser(owner).getAgent(agentId)) return reply.status(404).send({ error: { code: 'agent-not-found', message: 'Agent was not found.' } });
    try {
      const policy = policyInput(request.body);
      repository.upsertPolicy(owner, agentId, policy);
      repository.addActivity({ userId: owner, agentId, event: 'policy-updated' });
      return { ...policy, dailyLimit: policy.dailyLimit.toString(), perTransactionLimit: policy.perTransactionLimit.toString() };
    } catch (error) {
      return reply.status(400).send({
        error: {
          code: 'invalid-policy',
          message: error instanceof Error ? error.message : 'Policy is invalid.',
        },
      });
    }
  });

  fastify.get('/api/agents/:agentId/activity', async (request, reply) => {
    const owner = userId(request, reply, auth);
    if (!owner) return;
    const { agentId } = request.params as { agentId: string };
    if (!manager.forUser(owner).getAgent(agentId)) return reply.status(404).send({ error: { code: 'agent-not-found', message: 'Agent was not found.' } });
    return repository.listActivity(owner, agentId);
  });

  fastify.post('/api/authorization/check', async (request, reply) => {
    try {
      const owner = userId(request, reply, auth);
      if (!owner) return;
      const parsed = intent(request.body);
      const agent = manager.forUser(owner).getAgent(String(parsed.agentId));
      if (!agent) return reply.status(404).send({ error: { code: 'agent-not-found', message: 'Agent was not found.' } });
      const decision = getAuthorization(owner, agent.agentId).authorize({ intent: parsed as never });
      repository.addActivity({ userId: owner, agentId: agent.agentId, event: decision.decision === 'allowed' ? 'authorization-allowed' : 'authorization-rejected' });
      return decision.decision === 'allowed' ? reply.send({ decision: 'allowed', reason: decision.reason }) : reply.status(403).send({ decision: 'rejected', code: decision.code, reason: decision.reason });
    } catch (error) {
      return reply.status(400).send({
        error: {
          code: 'invalid-intent',
          message: error instanceof Error ? error.message : 'Proposal is invalid.',
        },
      });
    }
  });

  // ─── Spend execution: browser-wallet split (two transactions, as before) ────
  //
  // POST /execute builds and proves the first unbound transaction (the
  // authorize*Agent leg) and returns it. After the browser submits it and
  // confirms via POST /execute/confirm, the backend builds the request*Spend
  // leg and returns it as the next pending transaction; confirming that one
  // completes the flow. Spend semantics are unchanged: the circuits authorize
  // and verify policy on-chain and never transfer funds.

  fastify.post('/api/authorization/execute', async (request, reply) => {
    const owner = userId(request, reply, auth);
    if (!owner) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = intent(request.body);
      if (parsed.action !== 'spend') throw new Error('Only spend intents may be executed.');
      const rawBody = request.body as Record<string, unknown>;
      if ('recipientCommitment' in rawBody || 'categoryCommitment' in rawBody) {
        throw new Error('Client-supplied policy commitments are not accepted.');
      }
    } catch (error) {
      return reply.status(400).send({
        error: {
          code: 'invalid-request',
          message: error instanceof Error ? error.message : 'Execution request is invalid.',
        },
      });
    }
    const execState = getExecutionState();
    if (!execState.execution) {
      const unavailable = executionUnavailable(execState);
      return reply.status(unavailable.statusCode).send({ error: { code: unavailable.code, message: unavailable.message } });
    }
    const execution = execState.execution;

    const agentId = String(parsed.agentId);
    try {
      const agent = manager.forUser(owner).getAgent(agentId);
      if (!agent) return reply.status(404).send({ error: { code: 'agent-not-found', message: 'Agent was not found.' } });
      const decision = getAuthorization(owner, agent.agentId).authorize({ intent: parsed as never });
      if (decision.decision !== 'allowed') return reply.status(403).send({ error: { code: decision.code, message: decision.reason } });
      const agentSecret = manager.forUser(owner).getAgentSecret(agent.agentId);
      if (!agentSecret) return reply.status(500).send({ error: { code: 'agent-identity-unavailable', message: 'Agent private identity is unavailable.' } });
      const keys = browserKeys(request.body);
      const pendingTransaction = await execution.createSpendAuthorizationTransaction({
        intent: parsed as never,
        agentType: agent.type,
        agentSecret,
        agentSecrets: privateSecretsForAgent(agent.type, agentSecret),
        privateStateScope: `${owner}:${agentId}`,
      }, getAuthorization(owner, agent.agentId), keys);
      repository.addActivity({ userId: owner, agentId: agent.agentId, event: 'execution-attempted' });
      return { status: 'pending-transaction', pendingTransaction };
    } catch (error) {
      request.log.error(error);
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(502).send({ error: { code: 'execution-failed', message } });
    }
  });

  fastify.post('/api/authorization/execute/confirm', async (request, reply) => {
    const owner = userId(request, reply, auth);
    if (!owner) return;
    let confirmation;
    try {
      confirmation = confirmInput(request.body);
    } catch (error) {
      return reply.status(400).send({ error: { code: 'invalid-request', message: error instanceof Error ? error.message : 'Confirmation request is invalid.' } });
    }
    const execState = getExecutionState();
    if (!execState.execution) {
      const unavailable = executionUnavailable(execState);
      return reply.status(unavailable.statusCode).send({ error: { code: unavailable.code, message: unavailable.message } });
    }
    const execution = execState.execution;
    try {
      const outcome = await execution.confirmPendingTransaction(confirmation.pendingTransactionId, confirmation.transactionId);
      if (outcome.status === 'pending-transaction') {
        // The first spend leg confirmed; hand the browser the request*Spend
        // transaction to balance/sign/submit next.
        return { status: 'pending-transaction', pendingTransaction: outcome.pendingTransaction };
      }
      if (outcome.flow !== 'spend-request' || outcome.userId !== owner) {
        return reply.status(404).send({ error: { code: 'pending-transaction-not-found', message: 'The pending transaction was not found.' } });
      }
      repository.recordSpend(outcome.userId, outcome.agentId, outcome.amount);
      repository.addActivity({ userId: owner, agentId: outcome.agentId, event: 'execution-confirmed', transactionId: outcome.transactionId });
      return { status: 'confirmed', transactionId: outcome.transactionId, contractAddress: outcome.contractAddress };
    } catch (error) {
      const pending = execution.describePending(confirmation.pendingTransactionId);
      if (pending && pending.userId === owner) {
        repository.addActivity({ userId: owner, agentId: pending.agentId, event: 'execution-failed' });
      }
      request.log.error(error);
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(502).send({ error: { code: 'execution-failed', message } });
    }
  });
}
