import type { AgentIntent } from '../agent-runtime/types.js';
import type { AgentType } from '../agent-identity.js';

export interface VouchExecutionRequest {
  readonly intent: AgentIntent;
  readonly agentType: AgentType;
  readonly agentSecret: Uint8Array;
  readonly agentSecrets: readonly [Uint8Array, Uint8Array, Uint8Array, Uint8Array];
  readonly privateStateScope: string;
}

export interface SuccessfulVouchExecution {
  readonly status: 'confirmed';
  readonly contractAddress: string;
  readonly transactionId: string;
  readonly intent: AgentIntent;
}

export type VouchTransactionKind = 'agent-authorization' | 'spend-authorization';

/**
 * Public keys of the connected user's wallet, read from the DApp connector's
 * `getShieldedAddresses()`. They are public values: the build step uses them so
 * the produced transaction belongs to the wallet that will balance, sign, and
 * submit it. No secret material crosses the backend/browser boundary.
 */
export interface VouchBrowserWalletKeys {
  readonly coinPublicKey: string;
  readonly encryptionPublicKey: string;
}

/**
 * An unbound (proven, unbalanced, unsigned) call transaction built by the
 * backend. The user's browser wallet balances/signs it via
 * `balanceUnsealedTransaction` and relays it via `submitTransaction`.
 */
export interface VouchPendingTransaction {
  readonly pendingTransactionId: string;
  readonly transactionKind: VouchTransactionKind;
  /** Serialized `Transaction<SignatureEnabled, Proof, PreBinding>` in hex. */
  readonly unboundTxHex: string;
  readonly circuitId: string;
  readonly contractAddress: string;
  readonly expiresAt: string;
}

export type VouchPendingConfirmResult =
  | { readonly status: 'confirmed'; readonly transactionId: string; readonly contractAddress: string }
  | { readonly status: 'pending-transaction'; readonly pendingTransaction: VouchPendingTransaction };

export type VouchExecutionErrorCode =
  | 'pre-validation-rejected'
  | 'wallet-unavailable'
  | 'contract-not-deployed'
  | 'contract-lookup-failed'
  | 'proof-generation-failed'
  | 'transaction-submission-failed'
  | 'transaction-rejected'
  | 'transaction-finalization-failed'
  | 'pending-transaction-not-found'
  | 'confirmation-timeout'
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
