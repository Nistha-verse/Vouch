import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { GroqBuiltInAgentRuntime } from '../../agent-runtime/groq-runtime.js';
import { createAgentIntent, type AgentTask } from '../../agent-runtime/types.js';
import type { AgentManager } from '../../agent-manager.js';
import type { AgentRepository } from '../../persistence/database.js';
import { bearerAgentToken, userId } from '../request-context.js';
import type { WalletAuthService } from '../auth.js';

function isAgentTask(value: unknown): value is AgentTask {
  if (typeof value !== 'object' || value === null) return false;
  const task = value as Record<string, unknown>;
  if (task.action === 'observe') return typeof task.subject === 'string';
  return task.action === 'spend'
    && typeof task.amount === 'string'
    && typeof task.recipient === 'string'
    && typeof task.category === 'string'
    && typeof task.reason === 'string';
}

export function registerRuntimeRoutes(
  fastify: FastifyInstance,
  manager: AgentManager,
  repository: AgentRepository,
  auth: WalletAuthService,
) {
  fastify.post('/api/custom-agent/connect', async (request, reply) => {
    const body = request.body as { agentId?: unknown; credential?: unknown } | undefined;
    if (
      typeof body?.agentId !== 'string'
      || typeof body.credential !== 'string'
      || body.credential.length > 128
    ) {
      return reply.status(400).send({
        error: { code: 'invalid-agent-credentials', message: 'Custom Agent ID and credential are required.' },
      });
    }

    const hash = createHash('sha256').update(body.credential).digest('hex');
    const match = repository.findAgentByCredentialHash(hash);
    if (!match || match.agent.agentId !== body.agentId || match.agent.status === 'revoked') {
      return reply.status(401).send({
        error: { code: 'invalid-agent-credentials', message: 'Custom Agent credentials are invalid or revoked.' },
      });
    }

    const session = auth.createAgentSession(match.userId, match.agent.agentId);
    reply.header('cache-control', 'no-store');
    return { agentId: match.agent.agentId, token: session.token, expiresAt: session.expiresAt };
  });

  fastify.post('/api/custom-agent/propose', async (request, reply) => {
    const token = bearerAgentToken(request.headers.authorization);
    const session = auth.getAgentSession(token);
    if (!session) {
      return reply.status(401).send({
        error: { code: 'agent-authentication-required', message: 'A valid Custom Agent session is required.' },
      });
    }

    const agent = manager.forUser(session.userId).getAgent(session.agentId);
    if (!agent || agent.type !== 'custom' || agent.status === 'revoked') {
      return reply.status(403).send({
        error: { code: 'custom-agent-unavailable', message: 'This Custom Agent is unavailable.' },
      });
    }
    if (agent.status !== 'active') {
      return reply.status(403).send({
        error: { code: 'agent-inactive', message: 'Activate this agent before it can propose an action.' },
      });
    }

    try {
      const input = request.body;
      if (!isAgentTask(input)) throw new Error('Custom Agent proposal fields are invalid.');
      const intent = createAgentIntent(agent.agentId, input);
      repository.addActivity({ userId: session.userId, agentId: agent.agentId, event: 'agent-proposal' });
      return { ...intent, ...(intent.action === 'spend' ? { amount: intent.amount.toString() } : {}) };
    } catch (error) {
      return reply.status(400).send({
        error: {
          code: 'invalid-agent-proposal',
          message: error instanceof Error ? error.message : 'Custom Agent proposal is invalid.',
        },
      });
    }
  });

  fastify.post('/api/agents/:agentId/propose', async (request, reply) => {
    const owner = userId(request, reply, auth);
    if (!owner) return;
    const { agentId } = request.params as { agentId: string };
    const scoped = manager.forUser(owner);
    const agent = scoped.getAgent(agentId);

    if (!agent) {
      return reply.status(404).send({
        error: { code: 'agent-not-found', message: `Agent ${agentId} not found.` },
      });
    }
    if (agent.status !== 'active') {
      return reply.status(400).send({
        error: { code: 'agent-inactive', message: 'Activate this agent before asking it to work.' },
      });
    }
    if (agent.type === 'custom') {
      return reply.status(400).send({
        error: { code: 'custom-runtime-required', message: 'Custom Agents must authenticate using their own credential and runtime.' },
      });
    }

    const body = request.body;
    if (!isAgentTask(body)) {
      return reply.status(400).send({
        error: { code: 'invalid-task', message: 'A valid agent task is required.' },
      });
    }

    try {
      const runtime = new GroqBuiltInAgentRuntime(agentId);
      const intent = await runtime.receiveTask(body);
      repository.addActivity({ userId: owner, agentId, event: 'agent-proposal' });
      const output = { ...intent } as Record<string, unknown>;
      if (typeof output.amount === 'bigint') output.amount = output.amount.toString();
      return reply.send(output);
    } catch (error: unknown) {
      request.log.error(error);
      return reply.status(502).send({
        error: {
          code: 'runtime-error',
          message: error instanceof Error ? `Agent runtime failed: ${error.message}` : 'Agent runtime failed to produce a proposal.',
        },
      });
    }
  });
}
