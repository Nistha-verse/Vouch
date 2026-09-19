import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => ({ status: 'ok', service: 'vouch-api' }));

  fastify.get('/ready', async () => ({ ready: true, service: 'vouch-api' }));
}
