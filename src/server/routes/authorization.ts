import type { FastifyInstance } from 'fastify';
import type { AuthorizationService } from '../../authorization/service.js';
import type { VouchExecutionService } from '../../execution/service.js';

function parseAmountStrict(s: unknown): bigint {
  if (typeof s !== 'string') throw new Error('Amount must be a decimal string');
  if (s.trim() !== s) throw new Error('Amount must not have surrounding whitespace');
  if (!/^[0-9]+$/.test(s)) throw new Error('Amount must be a whole decimal integer string');
  if (s === '0') throw new Error('Amount must be greater than zero');
  if (s.startsWith('0') && s !== '0') {
    // allow "0" only which is rejected above; leading zeros are allowed? Reject to be strict
    // but some callers may use leading zeros; choose to reject to avoid ambiguity
    throw new Error('Amount must not have leading zeros');
  }
  try {
    const v = BigInt(s);
    if (v <= 0n) throw new Error('Amount must be positive');
    return v;
  } catch (e) {
    throw new Error('Invalid amount');
  }
}

function validateHex32(s: unknown): Uint8Array {
  if (typeof s !== 'string') throw new Error('Commitment must be a 64-char hex string');
  if (!/^[0-9a-fA-F]{64}$/.test(s)) throw new Error('Commitment must be 32 bytes (64 hex chars)');
  return Uint8Array.from(Buffer.from(s, 'hex'));
}

export function registerAuthorizationRoutes(fastify: FastifyInstance, authorization: AuthorizationService, execution?: VouchExecutionService) {
  fastify.post('/api/authorization/check', async (request, reply) => {
    const body = request.body as any;
    try {
      // Basic validation
      if (!body || typeof body.agentId !== 'string' || typeof body.kind !== 'string' || typeof body.action !== 'string') {
        return reply.status(400).send({ error: { code: 'invalid-intent', message: 'Malformed intent' } });
      }

      const intent: any = { ...body };
      if (intent.action === 'spend') {
        intent.amount = parseAmountStrict(body.amount);
      }

      const decision = authorization.authorize({ intent });
      // Map decision to response
      if (decision.decision === 'allowed') {
        return reply.send({ decision: 'allowed', message: 'Application pre-validation passed; Midnight authorization is still required.' , decisionDetail: decision });
      }
      return reply.status(403).send({ decision: 'rejected', code: decision.code, reason: decision.reason });
    } catch (err: unknown) {
      return reply.status(400).send({ error: { code: 'invalid-amount', message: (err as Error).message } });
    }
  });

  fastify.post('/api/authorization/execute', async (request, reply) => {
    if (!execution) return reply.status(501).send({ error: { code: 'execution-not-available', message: 'Server does not have execution configured' } });
    const body = request.body as any;
    try {
      if (!body || typeof body.agentId !== 'string' || typeof body.kind !== 'string' || typeof body.action !== 'string') {
        return reply.status(400).send({ error: { code: 'invalid-intent', message: 'Malformed intent' } });
      }
      if (body.action !== 'spend') return reply.status(400).send({ error: { code: 'unsupported-action', message: 'Only spend intents may be executed' } });
      const amount = parseAmountStrict(body.amount);
      const recipientCommitment = validateHex32(body.recipientCommitment);
      const categoryCommitment = validateHex32(body.categoryCommitment);
      const intent = { ...body, amount };

      // pre-validation
      const pre = authorization.authorize({ intent });
      if (pre.decision !== 'allowed') {
        return reply.status(403).send({ error: { code: pre.code ?? 'pre-validation-failed', message: pre.reason } });
      }

      try {
        const result = await execution.authorizeSpend({ intent, recipientCommitment, categoryCommitment });
        return reply.send(result);
              } catch (err: unknown) {
        console.error('Vouch execution failed:', err);

        return reply.status(502).send({
          error: {
            code: 'execution-failed',
            message: 'Midnight authorization execution failed.',
          },
        });
      }
      
    } catch (err: unknown) {
      return reply.status(400).send({ error: { code: 'invalid-request', message: (err as Error).message } });
    }
  });
}
