import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { AgentManager } from '../agent-manager.js';
import { AuthorizationService } from '../authorization/service.js';
import { SqliteAgentRepository, type AgentRepository } from '../persistence/database.js';
import type { VouchExecutionAdapter } from '../execution/service.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerAuthorizationRoutes } from './routes/authorization.js';
import { registerRuntimeRoutes } from './routes/runtime.js';
import { WalletAuthService } from './auth.js';
import { registerAuthRoutes } from './routes/auth.js';
import type { DeploymentRecord, NetworkId } from '../network.js';

export interface AppServices {
  agentManager: AgentManager;
  authorization: AuthorizationService;
  repository: AgentRepository;
  execution?: VouchExecutionAdapter;
  auth: WalletAuthService;
}

export interface CreateAppOptions {
  readonly execution?: VouchExecutionAdapter;
  readonly executionState?: {
    status: 'syncing' | 'ready' | 'unavailable';
    error?: string;
    execution?: VouchExecutionAdapter;
  };
  readonly databasePath?: string;
  readonly networkInfo?: {
    readonly network: NetworkId;
    readonly deployment: DeploymentRecord | null;
  };
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

  registerHealthRoutes(fastify, opts.networkInfo, opts.executionState);
  registerAuthRoutes(fastify, auth);
  registerAgentRoutes(fastify, agentManager, repository, auth);
  registerRuntimeRoutes(fastify, agentManager, repository, auth);
  registerAuthorizationRoutes(
    fastify,
    agentManager,
    repository,
    () => opts.executionState ?? (opts.execution ? { status: 'ready', execution: opts.execution } : { status: 'unavailable', error: 'No execution adapter configured.' }),
    auth,
  );

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
