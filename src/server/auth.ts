import { randomBytes } from 'node:crypto';
import { verifySignature } from '@midnight-ntwrk/midnight-js-protocol/ledger';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

interface Challenge {
  readonly value: string;
  readonly expiresAt: number;
}

interface Session {
  readonly userId: string;
  readonly expiresAt: number;
}

export interface WalletSignature {
  readonly signature: string;
  readonly verifyingKey: string;
  readonly data: string;
}

export class WalletAuthService {
  private readonly challenges = new Map<string, Challenge>();
  private readonly sessions = new Map<string, Session>();

  createChallenge(): { challenge: string; expiresAt: string } {
    const challenge = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + CHALLENGE_TTL_MS;
    this.challenges.set(challenge, { value: challenge, expiresAt });
    return { challenge, expiresAt: new Date(expiresAt).toISOString() };
  }

  verifyChallenge(challenge: unknown, signature: unknown): { token: string; userId: string; expiresAt: string } {
    if (typeof challenge !== 'string' || typeof signature !== 'object' || signature === null) {
      throw new Error('A challenge and wallet signature are required.');
    }
    const record = this.challenges.get(challenge);
    this.challenges.delete(challenge);
    if (!record || record.expiresAt < Date.now()) throw new Error('The authentication challenge is invalid or expired.');

    const input = signature as Partial<WalletSignature>;
    if (
      typeof input.data !== 'string'
      || typeof input.signature !== 'string'
      || typeof input.verifyingKey !== 'string'
      || input.data !== challenge
    ) {
      throw new Error('The wallet signature does not match the authentication challenge.');
    }

    let valid = false;
    try {
      valid = verifySignature(
        input.verifyingKey,
        new TextEncoder().encode(challenge),
        input.signature,
      );
    } catch {
      valid = false;
    }
    if (!valid) throw new Error('The wallet signature could not be verified.');

    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_TTL_MS;
    this.sessions.set(token, { userId: input.verifyingKey, expiresAt });
    return { token, userId: input.verifyingKey, expiresAt: new Date(expiresAt).toISOString() };
  }

  getUserId(token: string | undefined): string | undefined {
    if (!token) return undefined;
    const session = this.sessions.get(token);
    if (!session) return undefined;
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return undefined;
    }
    return session.userId;
  }
}
