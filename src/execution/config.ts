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

function optionalCommitment(name: string): Uint8Array {
  const value = process.env[name]?.trim();
  if (!value || !HEX_32.test(value)) {
    throw new Error(`${name} must be exactly 32 bytes encoded as 64 hexadecimal characters.`);
  }
  return Uint8Array.from(Buffer.from(value, 'hex'));
}

export function loadVouchPrivateState(): VouchPrivateState {
  const dailyLimit = BigInt(process.env.VOUCH_DAILY_LIMIT ?? '100');
  const perTransactionLimit = BigInt(process.env.VOUCH_PER_TRANSACTION_LIMIT ?? '25');
  if (dailyLimit <= 0n || perTransactionLimit <= 0n || perTransactionLimit > dailyLimit) {
    throw new Error('Vouch policy limits must be positive and per-transaction limit cannot exceed daily limit.');
  }

  return {
    dailyLimit,
    perTransactionLimit,
    spentToday: 0n,
    allowedRecipientCommitment: optionalCommitment('VOUCH_ALLOWED_RECIPIENT_COMMITMENT'),
    allowedCategoryCommitment: optionalCommitment('VOUCH_ALLOWED_CATEGORY_COMMITMENT'),
    ownerSecret: requiredSecret('VOUCH_OWNER_SECRET'),
    agentSecret: requiredSecret('VOUCH_AGENT_SECRET'),
  };
}

export function createLocalVouchSecrets(): Record<string, string> {
  return {
    VOUCH_OWNER_SECRET: randomBytes(32).toString('hex'),
    VOUCH_AGENT_SECRET: randomBytes(32).toString('hex'),
    VOUCH_ALLOWED_RECIPIENT_COMMITMENT: randomBytes(32).toString('hex'),
    VOUCH_ALLOWED_CATEGORY_COMMITMENT: randomBytes(32).toString('hex'),
  };
}
