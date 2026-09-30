import type { FastifyInstance } from 'fastify';
import type { CreateAppOptions } from '../app.js';

export function registerHealthRoutes(
  fastify: FastifyInstance,
  networkInfo?: CreateAppOptions['networkInfo'],
  executionState?: CreateAppOptions['executionState'],
) {
  fastify.get('/health', async () => ({ status: 'ok', service: 'vouch-api' }));

  fastify.get('/ready', async () => ({ ready: true, service: 'vouch-api' }));

  fastify.get('/api/network', async () => networkInfo
    ? {
      network: networkInfo.network,
      deployment: networkInfo.deployment,
      execution: executionState?.status ?? 'unavailable',
      ...(executionState?.error ? { executionError: executionState.error } : {}),
    }
    : { network: null, deployment: null });
}
