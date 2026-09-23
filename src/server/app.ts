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
import { WalletAuthService } from './auth.js';
import { registerAuthRoutes } from './routes/auth.js';

export interface AppServices {
  agentManager: AgentManager;
  authorization: AuthorizationService;
  repository: AgentRepository;
  execution?: VouchExecutionService;
  auth: WalletAuthService;
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
  const auth = new WalletAuthService();

  const fastify = Fastify({ logger: false });

  registerHealthRoutes(fastify);
  registerAuthRoutes(fastify, auth);
  registerAgentRoutes(fastify, agentManager, repository, auth);
  registerRuntimeRoutes(fastify, agentManager, repository, auth);
  registerAuthorizationRoutes(fastify, agentManager, repository, opts.execution, auth);

  return {
    fastify,
    services: {
      agentManager,
      authorization,
      repository,
      execution: opts.execution,
      auth,
    },
  };
}
