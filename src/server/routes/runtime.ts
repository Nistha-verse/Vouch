import type { FastifyInstance } from 'fastify';
import { GroqBuiltInAgentRuntime } from '../../agent-runtime/groq-runtime.js';
import type { AgentManager } from '../../agent-manager.js';
import type { AgentRepository } from '../../persistence/database.js';
import { scopedManager, userId } from '../request-context.js';

export function registerRuntimeRoutes(
  fastify: FastifyInstance,
  manager: AgentManager,
  repository: AgentRepository,
) {
  fastify.post('/api/agents/:agentId/propose', async (request, reply) => {
    const owner = userId(request, reply);
    if (!owner) return;
    const { agentId } = request.params as { agentId: string };
    const scoped = scopedManager(manager, request, reply);
    if (!scoped) return;
    const agent = scoped.getAgent(agentId);

    if (!agent) {
      return reply.status(404).send({
        error: {
          code: 'agent-not-found',
          message: `Agent ${agentId} not found`,
        },
      });
    }

    if (agent.status !== 'active') {
      return reply.status(400).send({
        error: {
          code: 'agent-inactive',
          message: 'Agent is not active',
        },
      });
    }

    if (agent.type === 'custom') {
      return reply.status(400).send({
        error: {
          code: 'custom-runtime-required',
          message: 'Custom agents must provide their own runtime.',
        },
      });
    }

    const body = request.body as any;

    if (!body || typeof body.action !== 'string') {
      return reply.status(400).send({
        error: {
          code: 'invalid-task',
          message: 'Invalid task',
        },
      });
    }

    try {
      const runtime = new GroqBuiltInAgentRuntime(agentId);
      const intent = await runtime.receiveTask(body);
      repository.addActivity({ userId: owner, agentId, event: 'agent-proposal' });

      const output = { ...intent } as Record<string, unknown>;

      if (typeof output.amount === 'bigint') {
        output.amount = output.amount.toString();
      }

      return reply.send(output);
    } catch (error: unknown) {
      console.error('Agent runtime failed:', error);

      return reply.status(502).send({
        error: {
          code: 'runtime-error',
          message: 'Agent runtime failed to produce a proposal.',
        },
      });
    }
  });
}
