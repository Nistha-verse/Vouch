import type { AgentManager } from '../agent-manager.js';
import type { AgentIntent, SpendAgentIntent } from '../agent-runtime/types.js';
import {
  type AgentAuthorizationState,
  type AuthorizationDecision,
  type AuthorizationPolicy,
  type AuthorizationReasonCode,
  type AuthorizationRequest,
} from './types.js';

const MAX_AGENT_ID_LENGTH = 64;
const MAX_RECIPIENT_LENGTH = 64;
const MAX_CATEGORY_LENGTH = 64;
const MAX_REASON_LENGTH = 500;
const MAX_SUBJECT_LENGTH = 500;
const AGENT_ID_PATTERN = /^agent-[0-9a-f]{8}$/;
export class AuthorizationService {
  private readonly policies = new Map<string, AgentAuthorizationState>();

  /**
   * `policies` must come from already-trusted application/user-controlled
   * configuration. This service does not authenticate policy authors or treat
   * policy configuration as cryptographic Midnight authorization.
   */
  constructor(
    private readonly agentManager: Pick<AgentManager, 'getAgent'>,
    policies: ReadonlyMap<string, AgentAuthorizationState> = new Map(),
  ) {
    for (const [agentId, state] of policies) {
      validateAgentId(agentId);
      validatePolicyState(state);
      this.policies.set(agentId, cloneAuthorizationState(state));
    }
  }

  authorize(request: AuthorizationRequest): AuthorizationDecision {
    const intent = request.intent as unknown;
    const agentId = readAgentId(intent);

    if (agentId === undefined) {
      return rejected('', 'unknown', 'invalid-agent-id', 'The intent has an invalid agent ID.');
    }

    if (!AGENT_ID_PATTERN.test(agentId) || agentId.length > MAX_AGENT_ID_LENGTH) {
      return rejected(agentId, readAction(intent), 'invalid-agent-id', 'The intent has an invalid agent ID.');
    }

    const agent = this.agentManager.getAgent(agentId);
    if (!agent) {
      return rejected(agentId, readAction(intent), 'agent-not-found', `Agent ${agentId} was not found.`);
    }

    if (agent.status !== 'active') {
      return rejected(agentId, readAction(intent), 'agent-inactive', `Agent ${agentId} is not active.`);
    }

    if (agent.authorization.status !== 'authorized') {
      return rejected(agentId, readAction(intent), 'agent-not-authorized', `Agent ${agentId} is not authorized.`);
    }

    if (!isRecord(intent) || intent.kind !== 'proposal') {
      return rejected(agentId, readAction(intent), 'invalid-intent', 'The intent fields are invalid.');
    }

    if (intent.action === 'observe') {
      if (!isAgentIntent(intent)) {
        return rejected(agentId, intent.action, 'invalid-intent', 'The observation fields are invalid.');
      }
      return allowed(intent);
    }

    if (intent.action !== 'spend') {
      return rejected(agentId, 'unknown', 'unsupported-action', 'The requested action is not supported.');
    }

    const state = this.policies.get(agentId);
    if (!state) {
      return rejected(agentId, intent.action, 'agent-not-authorized', 'No authorization policy is configured for this agent.');
    }

    const amountError = validateAmount(intent.amount);
    if (amountError) {
      return rejected(agentId, intent.action, 'invalid-amount', amountError);
    }

    const fieldError = validateSpendFields(intent);
    if (fieldError) {
      return rejected(agentId, intent.action, 'invalid-intent', fieldError);
    }

    if (!isSpendIntent(intent)) {
      return rejected(agentId, intent.action, 'invalid-intent', 'The spend intent fields are invalid.');
    }

    if (intent.amount > state.policy.perTransactionLimit) {
      return rejected(
        agentId,
        intent.action,
        'per-transaction-limit',
        'The amount exceeds the per-transaction spending limit.',
      );
    }

    if (state.spentToday + intent.amount > state.policy.dailyLimit) {
      return rejected(agentId, intent.action, 'daily-limit', 'The amount exceeds the remaining daily spending limit.');
    }

    if (state.policy.allowedCategories && !state.policy.allowedCategories.includes(intent.category)) {
      return rejected(agentId, intent.action, 'category-not-allowed', 'The spend category is not allowed by policy.');
    }

    if (state.policy.allowedRecipients && !state.policy.allowedRecipients.includes(intent.recipient)) {
      return rejected(agentId, intent.action, 'recipient-not-allowed', 'The recipient is not allowed by policy.');
    }

    // This is only deterministic application pre-validation for UX. Compact/
    // Midnight remains authoritative for cryptographic authorization, policy
    // enforcement, accounting, and final transaction acceptance/rejection.
    // Concurrent checks can read the same spentToday snapshot, so this result
    // is not a reservation and must never be treated as authoritative spending
    // authorization.
    return allowed(intent);
  }
}

function allowed(intent: AgentIntent): AuthorizationDecision {
  return {
    decision: 'allowed',
    agentId: intent.agentId,
    intent,
    code: 'allowed',
    reason: 'Application pre-validation passed; Midnight authorization is still required.',
  };
}

function rejected(
  agentId: string,
  action: AgentIntent['action'] | 'unknown',
  code: Exclude<AuthorizationReasonCode, 'allowed'>,
  reason: string,
): AuthorizationDecision {
  return { decision: 'rejected', agentId, action, code, reason };
}

function readAgentId(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.agentId !== 'string') {
    return undefined;
  }
  return value.agentId;
}

function readAction(value: unknown): AgentIntent['action'] | 'unknown' {
  if (!isRecord(value) || (value.action !== 'spend' && value.action !== 'observe')) {
    return 'unknown';
  }
  return value.action;
}

function isAgentIntent(value: unknown): value is AgentIntent {
  if (!isRecord(value) || value.kind !== 'proposal' || typeof value.agentId !== 'string') {
    return false;
  }

  if (value.action === 'observe') {
    return isBoundedText(value.subject, MAX_SUBJECT_LENGTH);
  }

  return value.action === 'spend'
    && isSpendIntent(value);
}

function isSpendIntent(value: unknown): value is SpendAgentIntent {
  return isRecord(value)
    && value.kind === 'proposal'
    && value.action === 'spend'
    && typeof value.agentId === 'string'
    && typeof value.amount === 'bigint'
    && isBoundedText(value.recipient, MAX_RECIPIENT_LENGTH)
    && isBoundedText(value.category, MAX_CATEGORY_LENGTH)
    && isBoundedText(value.reason, MAX_REASON_LENGTH);
}

function validateAmount(amount: unknown): string | undefined {
  if (typeof amount !== 'bigint' || amount <= 0n) {
    return 'Spend amount must be a positive bigint.';
  }
  return undefined;
}

function validateSpendFields(intent: Record<string, unknown>): string | undefined {
  if (!isBoundedText(intent.recipient, MAX_RECIPIENT_LENGTH)) {
    return 'Recipient must be non-empty and within the maximum length.';
  }
  if (!isBoundedText(intent.category, MAX_CATEGORY_LENGTH)) {
    return 'Category must be non-empty and within the maximum length.';
  }
  if (!isBoundedText(intent.reason, MAX_REASON_LENGTH)) {
    return 'Reason must be non-empty and within the maximum length.';
  }
  return undefined;
}

function validateAgentId(agentId: string): void {
  if (agentId.length > MAX_AGENT_ID_LENGTH || !AGENT_ID_PATTERN.test(agentId)) {
    throw new Error('Agent ID must match the expected agent-xxxxxxxx format.');
  }
}

function validatePolicyState(state: AgentAuthorizationState): void {
  if (state.spentToday < 0n || state.policy.dailyLimit <= 0n || state.policy.perTransactionLimit <= 0n) {
    throw new Error('Policy limits must be positive and spentToday must not be negative.');
  }
  if (state.spentToday > state.policy.dailyLimit) {
    throw new Error('spentToday cannot exceed the daily limit.');
  }
  validatePolicyList(state.policy.allowedCategories, 'category');
  validatePolicyList(state.policy.allowedRecipients, 'recipient');
}

function cloneAuthorizationState(state: AgentAuthorizationState): AgentAuthorizationState {
  return {
    spentToday: state.spentToday,
    policy: {
      dailyLimit: state.policy.dailyLimit,
      perTransactionLimit: state.policy.perTransactionLimit,
      ...(state.policy.allowedCategories
        ? { allowedCategories: [...state.policy.allowedCategories] }
        : {}),
      ...(state.policy.allowedRecipients
        ? { allowedRecipients: [...state.policy.allowedRecipients] }
        : {}),
    },
  };
}

function validatePolicyList(values: readonly string[] | undefined, field: string): void {
  if (!values) return;
  for (const value of values) {
    if (!isBoundedText(value, field === 'category' ? MAX_CATEGORY_LENGTH : MAX_RECIPIENT_LENGTH)) {
      throw new Error(`Allowed ${field} values must be non-empty and within the maximum length.`);
    }
  }
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
