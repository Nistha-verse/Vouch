import type { FastifyInstance } from 'fastify';
import type { WalletAuthService } from '../auth.js';

export function registerAuthRoutes(fastify: FastifyInstance, auth: WalletAuthService): void {
  fastify.post('/api/auth/challenge', async () => auth.createChallenge());
  fastify.post('/api/auth/verify', async (request, reply) => {
    try {
      const body = request.body as { challenge?: unknown; signature?: unknown } | undefined;
      return auth.verifyChallenge(body?.challenge, body?.signature);
    } catch (error) {
      return reply.status(401).send({
        error: {
          code: 'authentication-failed',
          message: error instanceof Error ? error.message : 'Wallet authentication failed.',
        },
      });
    }
  });
}
