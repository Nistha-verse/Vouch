import type { AgentIntent } from '../agent-runtime/types.js';

export interface VouchExecutionRequest {
  readonly intent: AgentIntent;
}

export interface SuccessfulVouchExecution {
  readonly status: 'confirmed';
  readonly contractAddress: string;
  readonly transactionId: string;
  readonly intent: AgentIntent;
}

export type VouchExecutionErrorCode =
  | 'pre-validation-rejected'
  | 'wallet-unavailable'
  | 'contract-not-deployed'
  | 'contract-lookup-failed'
  | 'proof-generation-failed'
  | 'transaction-submission-failed'
  | 'transaction-rejected'
  | 'transaction-finalization-failed'
  | 'execution-failed';

export class VouchExecutionError extends Error {
  constructor(
    readonly code: VouchExecutionErrorCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = 'VouchExecutionError';
  }
}
