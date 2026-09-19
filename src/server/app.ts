import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { AgentManager } from '../agent-manager.js';
import { AuthorizationService } from '../authorization/service.js';
import type { VouchExecutionService } from '../execution/service.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerAuthorizationRoutes } from './routes/authorization.js';
import { registerRuntimeRoutes } from './routes/runtime.js';

export interface AppServices {
  agentManager: AgentManager;
  authorization: AuthorizationService;
  execution?: VouchExecutionService;
}

export interface CreateAppOptions {
  readonly execution?: VouchExecutionService;
}

export function createApp(opts: CreateAppOptions = {}): {
  fastify: FastifyInstance;
  services: AppServices;
} {
  const agentManager = new AgentManager();
  const authorization = new AuthorizationService({
    getAgent: (id: string) => agentManager.getAgent(id),
  } as any);

  const fastify = Fastify({ logger: false });

  registerHealthRoutes(fastify);
  registerAgentRoutes(fastify, agentManager);
  registerRuntimeRoutes(fastify, agentManager);
  registerAuthorizationRoutes(fastify, authorization, opts.execution);

  return {
    fastify,
    services: {
      agentManager,
      authorization,
      execution: opts.execution,
    },
  };
}

