import { randomBytes } from 'node:crypto';
import type { VouchPrivateState } from '../vouch-policy-witnesses.js';
import { commitmentForPolicyValue } from './midnight.js';

const HEX_32 = /^[0-9a-f]{64}$/i;

function requiredSecret(name: string): Uint8Array {
  const value = process.env[name]?.trim();
  if (!value || !HEX_32.test(value)) {
    throw new Error(`${name} must be exactly 32 bytes encoded as 64 hexadecimal characters.`);
  }
  return Uint8Array.from(Buffer.from(value, 'hex'));
}

function requiredPolicyValue(name: string, maxLength: number): string {
  const value = process.env[name]?.trim();
  if (!value || value.length > maxLength) {
    throw new Error(`${name} must be a non-empty value no longer than ${maxLength} characters.`);
  }
  return value;
}

export function loadVouchPrivateState(): VouchPrivateState {
  const dailyLimit = BigInt(process.env.VOUCH_DAILY_LIMIT ?? '100');
  const perTransactionLimit = BigInt(process.env.VOUCH_PER_TRANSACTION_LIMIT ?? '25');
  if (dailyLimit <= 0n || perTransactionLimit <= 0n || perTransactionLimit > dailyLimit) {
    throw new Error('Vouch policy limits must be positive and per-transaction limit cannot exceed daily limit.');
  }

  const allowedRecipient = requiredPolicyValue('VOUCH_ALLOWED_RECIPIENT', 64);
  const allowedCategory = requiredPolicyValue('VOUCH_ALLOWED_CATEGORY', 64);
  return {
    dailyLimit,
    perTransactionLimit,
    spentToday: 0n,
    allowedRecipientCommitment: commitmentForPolicyValue(allowedRecipient),
    allowedCategoryCommitment: commitmentForPolicyValue(allowedCategory),
    ownerSecret: requiredSecret('VOUCH_OWNER_SECRET'),
    agentSecret: requiredSecret('VOUCH_AGENT_SECRET'),
  };
}

export function createLocalVouchSecrets(): Record<string, string> {
  return {
    VOUCH_OWNER_SECRET: randomBytes(32).toString('hex'),
    VOUCH_AGENT_SECRET: randomBytes(32).toString('hex'),
    VOUCH_ALLOWED_RECIPIENT: `recipient-${randomBytes(8).toString('hex')}`,
    VOUCH_ALLOWED_CATEGORY: `category-${randomBytes(8).toString('hex')}`,
  };
}
