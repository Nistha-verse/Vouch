import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AgentManager } from '../agent-manager.js';

export const USER_HEADER = 'x-vouch-wallet-address';

export function userId(request: FastifyRequest, reply: FastifyReply): string | undefined {
  const value = request.headers[USER_HEADER];
  if (typeof value !== 'string' || value.length < 3 || value.length > 256 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    void reply.status(401).send({ error: { code: 'authentication-required', message: 'A wallet identity is required.' } });
    return undefined;
  }
  return value;
}

export function scopedManager(manager: AgentManager, request: FastifyRequest, reply: FastifyReply): AgentManager | undefined {
  const id = userId(request, reply);
  return id ? manager.forUser(id) : undefined;
}
