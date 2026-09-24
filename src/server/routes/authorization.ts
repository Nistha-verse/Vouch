import type { FastifyInstance } from 'fastify';
import type { AgentManager } from '../../agent-manager.js';
import { AuthorizationService } from '../../authorization/service.js';
import type { AuthorizationPolicy } from '../../authorization/types.js';
import type { VouchExecutionService } from '../../execution/service.js';
import type { AgentRepository } from '../../persistence/database.js';
import { scopedManager, userId } from '../request-context.js';
import { canonicalCategory, canonicalRecipient } from '../../authorization/canonical.js';
import type { WalletAuthService } from '../auth.js';

const decimal = /^[1-9][0-9]*$/;
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

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
  const list = (field: string, max: number): string[] | undefined => {
    if (input[field] === undefined) return undefined;
    if (!Array.isArray(input[field]) || input[field].length > 100 || !input[field].every((item) => text(item, max))) throw new Error(`Invalid ${field}.`);
    return (input[field] as string[]).map((item) => item.trim());
  };
  // Canonical lengths are authoritative (64). Keep list text checks aligned.
  const allowedCategories = list('allowedCategories', 64)?.map(canonicalCategory);
  const allowedRecipients = list('allowedRecipients', 64)?.map(canonicalRecipient);
  return { dailyLimit, perTransactionLimit, allowedCategories, allowedRecipients };
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

export function registerAuthorizationRoutes(fastify: FastifyInstance, manager: AgentManager, repository: AgentRepository, execution: VouchExecutionService | undefined, auth: WalletAuthService) {
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
    } catch {
      return reply.status(400).send({ error: { code: 'invalid-policy', message: 'Policy is invalid.' } });
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
    } catch {
      return reply.status(400).send({ error: { code: 'invalid-intent', message: 'Proposal is invalid.' } });
    }
  });

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
    } catch {
      return reply.status(400).send({ error: { code: 'invalid-request', message: 'Execution request is invalid.' } });
    }
    if (!execution) return reply.status(503).send({ error: { code: 'execution-not-available', message: 'Execution service is unavailable.' } });

    const agentId = String(parsed.agentId);
    try {
      const agent = manager.forUser(owner).getAgent(agentId);
      if (!agent) return reply.status(404).send({ error: { code: 'agent-not-found', message: 'Agent was not found.' } });
      const decision = getAuthorization(owner, agent.agentId).authorize({ intent: parsed as never });
      if (decision.decision !== 'allowed') return reply.status(403).send({ error: { code: decision.code, message: decision.reason } });
      repository.addActivity({ userId: owner, agentId: agent.agentId, event: 'execution-attempted' });
      const result = await execution.authorizeSpend({ intent: parsed as never }, getAuthorization(owner, agent.agentId));
      if (result.status !== 'confirmed' || typeof result.transactionId !== 'string' || !result.transactionId.trim()) {
        repository.addActivity({ userId: owner, agentId: agent.agentId, event: 'execution-failed' });
        return reply.status(502).send({ error: { code: 'execution-failed', message: 'Midnight execution failed.' } });
      }
      repository.recordSpend(owner, agent.agentId, parsed.amount as bigint);
      repository.addActivity({ userId: owner, agentId: agent.agentId, event: 'execution-confirmed', transactionId: result.transactionId });
      return result;
    } catch (error) {
      request.log.error(error);
      repository.addActivity({ userId: owner, agentId, event: 'execution-failed' });
      return reply.status(502).send({ error: { code: 'execution-failed', message: 'Midnight execution failed.' } });
    }
  });
}
