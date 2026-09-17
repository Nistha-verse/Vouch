import type { AgentIntent } from '../agent-runtime/types.js';

export const AUTHORIZATION_REASON_CODES = [
  'allowed',
  'agent-not-found',
  'agent-inactive',
  'agent-not-authorized',
  'invalid-agent-id',
  'invalid-amount',
  'invalid-intent',
  'per-transaction-limit',
  'daily-limit',
  'category-not-allowed',
  'recipient-not-allowed',
  'unsupported-action',
] as const;

export type AuthorizationReasonCode = (typeof AUTHORIZATION_REASON_CODES)[number];

export interface AuthorizationPolicy {
  readonly dailyLimit: bigint;
  readonly perTransactionLimit: bigint;
  readonly allowedCategories?: readonly string[];
  readonly allowedRecipients?: readonly string[];
}

export interface AgentAuthorizationState {
  readonly policy: AuthorizationPolicy;
  readonly spentToday: bigint;
}

export interface AuthorizationRequest {
  readonly intent: AgentIntent;
}

export interface AllowedAuthorizationDecision {
  /**
   * Application pre-validation passed. This is not cryptographic authorization
   * or a reservation of authoritative spending state by Midnight.
   */
  readonly decision: 'allowed';
  readonly agentId: string;
  readonly intent: AgentIntent;
  readonly code: 'allowed';
  readonly reason: string;
}

export interface RejectedAuthorizationDecision {
  readonly decision: 'rejected';
  readonly agentId: string;
  readonly action: AgentIntent['action'] | 'unknown';
  readonly code: Exclude<AuthorizationReasonCode, 'allowed'>;
  readonly reason: string;
}

export type AuthorizationDecision =
  | AllowedAuthorizationDecision
  | RejectedAuthorizationDecision;
