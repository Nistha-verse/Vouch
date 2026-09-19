import type { FastifyInstance } from 'fastify';
import type { AgentManager } from '../../agent-manager.js';

function isValidAgentType(v: unknown): v is string {
  return v === 'developer' || v === 'research' || v === 'task' || v === 'custom';
}

export function registerAgentRoutes(fastify: FastifyInstance, manager: AgentManager) {
  fastify.post('/api/agents', async (request, reply) => {
    const body = request.body as any;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const type = body?.type;
    if (!name) return reply.status(400).send({ error: { code: 'invalid-name', message: 'Agent name is required.' } });
    if (type !== undefined && !isValidAgentType(type)) {
      return reply.status(400).send({ error: { code: 'invalid-type', message: 'Unsupported agent type.' } });
    }

    const result = manager.create({ name: name, type });
    if (!result.ok) {
      const code = (result.error.code as string) ?? 'agent-create-failed';
      return reply.status(400).send({ error: { code, message: result.error.message, details: result.error.details } });
    }
    return reply.status(201).send(result.value);
  });

  fastify.get('/api/agents', async () => manager.listAgents());

  fastify.get('/api/agents/:agentId', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const agent = manager.getAgent(agentId);
    if (!agent) return reply.status(404).send({ error: { code: 'agent-not-found', message: `Agent ${agentId} was not found.` } });
    return agent;
  });

  fastify.post('/api/agents/:agentId/activate', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const r = manager.activateAgent(agentId);
    if (!r.ok) return reply.status(400).send({ error: { code: r.error.code, message: r.error.message } });
    return r.value;
  });

  fastify.post('/api/agents/:agentId/deactivate', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const r = manager.deactivateAgent(agentId);
    if (!r.ok) return reply.status(400).send({ error: { code: r.error.code, message: r.error.message } });
    return r.value;
  });

  fastify.post('/api/agents/:agentId/revoke', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const r = manager.revokeAgent(agentId);
    if (!r.ok) return reply.status(400).send({ error: { code: r.error.code, message: r.error.message } });
    return r.value;
  });

  fastify.post('/api/agents/:agentId/rename', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const body = request.body as { name?: unknown };
    const newName = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!newName) return reply.status(400).send({ error: { code: 'invalid-name', message: 'Name is required' } });

    const r = manager.renameAgent(agentId, newName);
    if (!r.ok) return reply.status(400).send({ error: { code: r.error.code, message: r.error.message } });
    return r.value;
  });
}
