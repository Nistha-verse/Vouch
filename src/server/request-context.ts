import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AgentManager } from '../agent-manager.js';
import type { WalletAuthService } from './auth.js';

export function userId(request: FastifyRequest, reply: FastifyReply, auth: WalletAuthService): string | undefined {
  const header = request.headers.authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  const value = auth.getUserId(token);
  if (!value) {
    void reply.status(401).send({ error: { code: 'authentication-required', message: 'A verified wallet session is required.' } });
    return undefined;
  }
  return value;
}

export function scopedManager(manager: AgentManager, request: FastifyRequest, reply: FastifyReply, auth: WalletAuthService): AgentManager | undefined {
  const id = userId(request, reply, auth);
  return id ? manager.forUser(id) : undefined;
}
