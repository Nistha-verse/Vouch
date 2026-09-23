import type { FastifyInstance } from 'fastify';
import type { AgentManager } from '../../agent-manager.js';
import type { AgentRepository } from '../../persistence/database.js';
import { scopedManager, userId } from '../request-context.js';
import type { WalletAuthService } from '../auth.js';

function isValidAgentType(v: unknown): v is 'developer' | 'research' | 'task' | 'custom' {
  return v === 'developer' || v === 'research' || v === 'task' || v === 'custom';
}

function statusFor(code: string): number {
  return code === 'agent-not-found' ? 404 : code.startsWith('already-') ? 409 : 400;
}

export function registerAgentRoutes(fastify: FastifyInstance, manager: AgentManager, repository: AgentRepository, auth: WalletAuthService) {
  fastify.post('/api/agents', async (request, reply) => {
    const scoped = scopedManager(manager, request, reply, auth);
    const owner = userId(request, reply, auth);
    if (!scoped || !owner) return;
    const body = request.body as { name?: unknown; type?: unknown } | undefined;
    if (typeof body?.name !== 'string' || !body.name.trim()) return reply.status(400).send({ error: { code: 'invalid-name', message: 'Agent name is required.' } });
    if (body.type !== undefined && !isValidAgentType(body.type)) return reply.status(400).send({ error: { code: 'invalid-type', message: 'Unsupported agent type.' } });
    try {
      const result = scoped.create({ name: body.name, type: body.type });
      if (!result.ok) return reply.status(statusFor(result.error.code)).send({ error: { code: result.error.code, message: 'Unable to create agent.' } });
      repository.addActivity({ userId: owner, agentId: result.value.agentId, event: 'agent-created' });
      return reply.status(201).send(result.value);
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: { code: 'internal-error', message: 'Unable to create agent.' } });
    }
  });

  fastify.get('/api/agents', async (request, reply) => {
    const scoped = scopedManager(manager, request, reply, auth);
    return scoped ? scoped.listAgents() : undefined;
  });

  fastify.get('/api/agents/:agentId', async (request, reply) => {
    const scoped = scopedManager(manager, request, reply, auth);
    if (!scoped) return;
    const { agentId } = request.params as { agentId: string };
    const agent = scoped.getAgent(agentId);
    return agent ? agent : reply.status(404).send({ error: { code: 'agent-not-found', message: 'Agent was not found.' } });
  });

  for (const action of ['activate', 'deactivate', 'revoke'] as const) {
    fastify.post(`/api/agents/:agentId/${action}`, async (request, reply) => {
      const scoped = scopedManager(manager, request, reply, auth);
      const owner = userId(request, reply, auth);
      if (!scoped || !owner) return;
      const { agentId } = request.params as { agentId: string };
      const result = action === 'activate' ? scoped.activateAgent(agentId) : action === 'deactivate' ? scoped.deactivateAgent(agentId) : scoped.revokeAgent(agentId);
      if (!result.ok) return reply.status(statusFor(result.error.code)).send({ error: { code: result.error.code, message: 'Agent state transition was not applied.' } });
      repository.addActivity({ userId: owner, agentId, event: action === 'revoke' ? 'agent-revoked' : `agent-${action}d` });
      return result.value;
    });
  }

  fastify.post('/api/agents/:agentId/rename', async (request, reply) => {
    const scoped = scopedManager(manager, request, reply, auth);
    if (!scoped) return;
    const { agentId } = request.params as { agentId: string };
    const body = request.body as { name?: unknown } | undefined;
    if (typeof body?.name !== 'string' || !body.name.trim()) return reply.status(400).send({ error: { code: 'invalid-name', message: 'Name is required.' } });
    const result = scoped.renameAgent(agentId, body.name);
    if (!result.ok) return reply.status(statusFor(result.error.code)).send({ error: { code: result.error.code, message: 'Agent rename was not applied.' } });
    return result.value;
  });
}
