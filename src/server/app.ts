import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { AgentManager } from '../agent-manager.js';
import { AuthorizationService } from '../authorization/service.js';
import { SqliteAgentRepository, type AgentRepository } from '../persistence/database.js';
import type { VouchExecutionService } from '../execution/service.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerAuthorizationRoutes } from './routes/authorization.js';
import { registerRuntimeRoutes } from './routes/runtime.js';

export interface AppServices {
  agentManager: AgentManager;
  authorization: AuthorizationService;
  repository: AgentRepository;
  execution?: VouchExecutionService;
}

export interface CreateAppOptions {
  readonly execution?: VouchExecutionService;
  readonly databasePath?: string;
}

export function createApp(opts: CreateAppOptions = {}): {
  fastify: FastifyInstance;
  services: AppServices;
} {
  const repository = new SqliteAgentRepository(opts.databasePath);
  const agentManager = new AgentManager(undefined, repository);
  const authorization = new AuthorizationService({ getAgent: () => undefined });

  const fastify = Fastify({ logger: false });

  registerHealthRoutes(fastify);
  registerAgentRoutes(fastify, agentManager, repository);
  registerRuntimeRoutes(fastify, agentManager, repository);
  registerAuthorizationRoutes(fastify, agentManager, repository, opts.execution);

  return {
    fastify,
    services: {
      agentManager,
      authorization,
      repository,
      execution: opts.execution,
    },
  };
}
