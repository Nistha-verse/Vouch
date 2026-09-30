import { randomBytes } from 'node:crypto';
import type { VouchPrivateState } from '../vouch-policy-witnesses.js';

const HEX_32 = /^[0-9a-f]{64}$/i;

function requiredSecret(name: string): Uint8Array {
  const value = process.env[name]?.trim();
  if (!value || !HEX_32.test(value)) {
    throw new Error(`${name} must be exactly 32 bytes encoded as 64 hexadecimal characters.`);
  }
  return Uint8Array.from(Buffer.from(value, 'hex'));
}

export function loadVouchPrivateState(agentSecretsOverride?: readonly [Uint8Array, Uint8Array, Uint8Array, Uint8Array]): VouchPrivateState {
  const dailyLimit = BigInt(process.env.VOUCH_DAILY_LIMIT ?? '100');
  const perTransactionLimit = BigInt(process.env.VOUCH_PER_TRANSACTION_LIMIT ?? '25');
  if (dailyLimit <= 0n || perTransactionLimit <= 0n || perTransactionLimit > dailyLimit) {
    throw new Error('Vouch policy limits must be positive and per-transaction limit cannot exceed daily limit.');
  }

  const legacyAgent = process.env.VOUCH_AGENT_SECRET?.trim();
  const agentSecrets = agentSecretsOverride ?? [0, 1, 2, 3].map((slot) => {
    const name = `VOUCH_AGENT_SECRET_${slot}`;
    if (process.env[name]) return requiredSecret(name);
    if (slot === 0 && legacyAgent) return requiredSecret('VOUCH_AGENT_SECRET');
    throw new Error(`${name} must be set for the multi-agent deployment.`);
  }) as [Uint8Array, Uint8Array, Uint8Array, Uint8Array];
  return {
    dailyLimit,
    perTransactionLimit,
    spentToday: 0n,
    ownerSecret: requiredSecret('VOUCH_OWNER_SECRET'),
    agentSecrets,
  };
}

export function createLocalVouchSecrets(): Record<string, string> {
  return {
    VOUCH_OWNER_SECRET: randomBytes(32).toString('hex'),
    VOUCH_AGENT_SECRET: randomBytes(32).toString('hex'),
  };
}
