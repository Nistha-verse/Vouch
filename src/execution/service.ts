import { randomUUID } from 'node:crypto';
import { CallTxFailedError, createUnprovenCallTxFromInitialStates, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { parseCoinPublicKeyToHex, parseEncPublicKeyToHex, toHex } from '@midnight-ntwrk/midnight-js-utils';
import { SucceedEntirely } from '@midnight-ntwrk/midnight-js-types';
import type { AuthorizationService } from '../authorization/index.js';
import type { NetworkConfig, NetworkId } from '../network.js';
import type { AgentType } from '../agent-identity.js';
import { getDeployment } from '../network.js';
import type { WalletContext } from '../wallet.js';
import { loadVouchPrivateState } from './config.js';
import {
  assertPrivateStateShape,
  commitmentForPolicyValue,
  commitmentForSecret,
  createVouchCallTxProviders,
  createVouchProviders,
  VOUCH_PRIVATE_STATE_ID,
} from './midnight.js';
import { compiledVouchPolicy } from '../vouch-policy.js';
import {
  VouchExecutionError,
  type SuccessfulVouchExecution,
  type VouchBrowserWalletKeys,
  type VouchExecutionRequest,
  type VouchPendingTransaction,
} from './types.js';

const CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000;
const PENDING_TRANSACTION_TTL_MS = 30 * 60 * 1000;

const AGENT_SLOT_BY_TYPE = { task: 0, research: 1, developer: 2, custom: 3 } as const;
const AUTHORIZATION_CIRCUITS = [
  'authorizeTaskAgent',
  'authorizeResearchAgent',
  'authorizeDeveloperAgent',
  'authorizeCustomAgent',
] as const;
const SPEND_CIRCUITS = [
  'requestTaskSpend',
  'requestResearchSpend',
  'requestDeveloperSpend',
  'requestCustomSpend',
] as const;

type PendingAgentAuthorization = {
  readonly kind: 'agent-authorization';
  readonly userId: string;
  readonly agentId: string;
  readonly agentType: AgentType;
  readonly agentCommitment: Uint8Array;
  readonly browserKeys: VouchBrowserWalletKeys;
  readonly initialPrivateState: ReturnType<typeof loadVouchPrivateState>;
};

type PendingSpendAuthorization = {
  readonly kind: 'spend-authorize';
  readonly userId: string;
  readonly agentId: string;
  readonly agentType: AgentType;
  readonly agentSecret: Uint8Array;
  readonly amount: bigint;
  readonly recipientCommitment: Uint8Array;
  readonly categoryCommitment: Uint8Array;
  readonly browserKeys: VouchBrowserWalletKeys;
  readonly initialPrivateState: ReturnType<typeof loadVouchPrivateState>;
};

type PendingSpendRequest = {
  readonly kind: 'spend-request';
  readonly userId: string;
  readonly agentId: string;
  readonly agentType: AgentType;
  readonly agentSecret: Uint8Array;
  readonly amount: bigint;
  readonly browserKeys: VouchBrowserWalletKeys;
  readonly initialPrivateState: ReturnType<typeof loadVouchPrivateState>;
};

type PendingRecord = {
  readonly data: PendingAgentAuthorization | PendingSpendAuthorization | PendingSpendRequest;
  readonly expiresAt: number;
};

export type VouchConfirmOutcome =
  | {
    readonly status: 'confirmed';
    readonly flow: 'agent-authorization';
    readonly transactionId: string;
    readonly contractAddress: string;
    readonly userId: string;
    readonly agentId: string;
    readonly agentType: AgentType;
    /** Hex commitment that was disclosed on-ledger by the authorize circuit. */
    readonly agentCommitmentHex: string;
  }
  | {
    readonly status: 'confirmed';
    readonly flow: 'spend-request';
    readonly transactionId: string;
    readonly contractAddress: string;
    readonly userId: string;
    readonly agentId: string;
    readonly amount: bigint;
  }
  | {
    readonly status: 'pending-transaction';
    readonly pendingTransaction: VouchPendingTransaction;
  };

export class VouchExecutionService {
  private readonly pending = new Map<string, PendingRecord>();

  constructor(
    private readonly authorization: Pick<AuthorizationService, 'authorize'>,
    private readonly network: NetworkId,
    private readonly networkConfig: NetworkConfig,
    /**
     * Optional backend wallet. The browser-wallet transaction split does not
     * use it; it exists only for the legacy full-service flow exercised by
     * scripts and demos that run their own synchronized wallet.
     */
    private readonly wallet?: WalletContext,
  ) {
    // Midnight.js circuit simulation resolves bech32 values against the ambient
    // network id. The server no longer constructs a wallet for the transaction
    // flow (which used to set this), so it is set here once at construction.
    setNetworkId(this.network);
  }

  // ─── Browser-wallet split: build leg ────────────────────────────────────────

  /**
   * Builds and proves the `authorize*Agent` unbound transaction. The caller
   * returns it to the browser, whose connected wallet balances/signs/submits
   * it and then confirms via `confirmPendingTransaction`. No backend execution
   * wallet and no synchronized wallet state is involved.
   */
  async createAgentAuthorizationTransaction(input: {
    readonly userId: string;
    readonly agentId: string;
    readonly agentType: AgentType;
    readonly agentSecret: Uint8Array;
    readonly browserKeys: VouchBrowserWalletKeys;
  }): Promise<VouchPendingTransaction> {
    const deployment = this.requireDeployment();
    const agentCommitment = commitmentForSecret(input.agentSecret);
    const initialPrivateState = this.privateStateForAgent(input.agentType, input.agentSecret);
    const pendingTransaction = await this.buildAndProveUnboundTx({
      circuitId: this.authorizationCircuitId(input.agentType),
      args: [agentCommitment],
      initialPrivateState,
      browserKeys: input.browserKeys,
      contractAddress: deployment.address,
    });
    this.pending.set(pendingTransaction.pendingTransactionId, {
      data: {
        kind: 'agent-authorization',
        userId: input.userId,
        agentId: input.agentId,
        agentType: input.agentType,
        agentCommitment,
        browserKeys: input.browserKeys,
        initialPrivateState,
      },
      expiresAt: Date.now() + PENDING_TRANSACTION_TTL_MS,
    });
    return pendingTransaction;
  }

  /**
   * Builds and proves the first leg of the two-transaction spend flow (the
   * `authorize*Agent` circuit, exactly as the previous server-side flow did).
   * After this leg confirms, `confirmPendingTransaction` builds and returns the
   * second pending transaction for the actual `request*Spend` circuit. Spend
   * semantics are unchanged: requests authorize/verify policy on-chain and
   * never transfer funds.
   */
  async createSpendAuthorizationTransaction(
    request: VouchExecutionRequest,
    authorization: Pick<AuthorizationService, 'authorize'> = this.authorization,
    browserKeys?: VouchBrowserWalletKeys,
  ): Promise<VouchPendingTransaction> {
    const decision = authorization.authorize({ intent: request.intent });
    if (decision.decision !== 'allowed') {
      throw new VouchExecutionError('pre-validation-rejected', decision.reason);
    }
    if (request.intent.action !== 'spend') {
      throw new VouchExecutionError('execution-failed', 'Only spend intents can be executed by this service.');
    }
    if (request.intent.agentId.trim() === '' || request.agentSecret.length !== 32 || !browserKeys) {
      throw new VouchExecutionError('execution-failed', 'A valid private identity and the connected wallet’s public keys are required for execution.');
    }
    const deployment = this.requireDeployment();
    const initialPrivateState = this.privateStateForAgent(request.agentType, request.agentSecret);
    const pendingTransaction = await this.buildAndProveUnboundTx({
      circuitId: this.authorizationCircuitId(request.agentType),
      args: [commitmentForSecret(request.agentSecret)],
      initialPrivateState,
      browserKeys,
      contractAddress: deployment.address,
    });
    this.pending.set(pendingTransaction.pendingTransactionId, {
      data: {
        kind: 'spend-authorize',
        userId: request.privateStateScope.split(':')[0],
        agentId: request.intent.agentId,
        agentType: request.agentType,
        agentSecret: request.agentSecret,
        amount: BigInt(request.intent.amount),
        recipientCommitment: commitmentForPolicyValue(request.intent.recipient.trim()),
        categoryCommitment: commitmentForPolicyValue(request.intent.category.trim()),
        browserKeys,
        initialPrivateState,
      },
      expiresAt: Date.now() + PENDING_TRANSACTION_TTL_MS,
    });
    return pendingTransaction;
  }

  // ─── Browser-wallet split: confirm leg ──────────────────────────────────────

  /**
   * Confirmation half of the split. The browser balanced/signed the unbound
   * transaction with the connected wallet, submitted it, and reports the
   * derived transaction ID here. The backend watches the Preprod indexer for
   * the transaction, checks its execution status, and persists private state.
   *
   * For the two-transaction spend flow, the first confirmed leg returns the
   * second pending transaction (the `request*Spend` build) instead of a final
   * confirmation.
   */
  async confirmPendingTransaction(pendingTransactionId: string, txId: string): Promise<VouchConfirmOutcome> {
    const pending = this.takePendingRecord(pendingTransactionId);
    const deployment = this.requireDeployment();
    const providers = createVouchCallTxProviders(this.network, this.networkConfig);
    let finalized;
    try {
      finalized = await withConfirmationTimeout(providers.publicDataProvider.watchForTxData(txId));
    } catch (error) {
      this.restorePendingRecord(pendingTransactionId, pending);
      throw classifyCircuitError(error, 'Midnight transaction confirmation failed.');
    }

    if (finalized.status !== SucceedEntirely) {
      throw new VouchExecutionError('transaction-rejected', 'Midnight recorded the submitted transaction as failed.');
    }

    if (pending.data.kind === 'agent-authorization') {
      await this.persistPrivateState(providers, deployment.address, pending.data.initialPrivateState);
      return {
        status: 'confirmed',
        flow: 'agent-authorization',
        transactionId: txId,
        contractAddress: deployment.address,
        userId: pending.data.userId,
        agentId: pending.data.agentId,
        agentType: pending.data.agentType,
        agentCommitmentHex: toHex(pending.data.agentCommitment),
      };
    }

    if (pending.data.kind === 'spend-authorize') {
      // First leg of the preserved two-transaction spend flow: the on-ledger
      // agent authorization is confirmed; build the request*Spend leg now so
      // the browser can submit it next.
      const spendPending = await this.buildSpendRequestTransaction(pending.data);
      return { status: 'pending-transaction', pendingTransaction: spendPending };
    }

    // Final leg: request*Spend confirmed. Persist the advanced private policy
    // state (spentToday) exactly as the getPolicy witness would have.
    await this.persistPrivateState(providers, deployment.address, {
      ...pending.data.initialPrivateState,
      spentToday: pending.data.initialPrivateState.spentToday + pending.data.amount,
    });
    return {
      status: 'confirmed',
      flow: 'spend-request',
      transactionId: txId,
      contractAddress: deployment.address,
      userId: pending.data.userId,
      agentId: pending.data.agentId,
      amount: pending.data.amount,
    };
  }

  /**
   * Flow and agent context of a still-pending transaction, without consuming
   * it. Used by routes to release claimed contract slots when a confirmation
   * fails.
   */
  describePending(pendingTransactionId: string): { readonly flow: 'agent-authorization' | 'spend-authorize' | 'spend-request'; readonly userId: string; readonly agentId: string; readonly agentType: AgentType } | undefined {
    const pending = this.pending.get(pendingTransactionId);
    if (!pending) return undefined;
    return {
      flow: pending.data.kind,
      userId: pending.data.userId,
      agentId: pending.data.agentId,
      agentType: pending.data.agentType,
    };
  }

  // ─── Legacy full-service flow (wallet-based; used by scripts/demos) ─────────

  async authorizeAgent(
    agentType: AgentType,
    agentSecret: Uint8Array,
    agentSecrets: readonly [Uint8Array, Uint8Array, Uint8Array, Uint8Array],
    privateStateScope?: string,
  ): Promise<string> {
    const deployment = getDeployment(this.network);
    if (!deployment) throw new VouchExecutionError('contract-not-deployed', `No Vouch contract deployment is recorded for ${this.network}.`);
    const wallet = this.requireLegacyWallet();
    const privateState = loadVouchPrivateState(agentSecrets);
    assertPrivateStateShape(privateState);
    // The deployed contract was initialized with the unscoped Vouch private
    // state; scoping here would load a different store whose ownerSecret does
    // not match, failing the owner witness assertion.
    const providers = createVouchProviders(wallet, this.network, this.networkConfig);
    const deployed = await findDeployedContract(providers as any, {
      compiledContract: compiledVouchPolicy,
      contractAddress: deployment.address,
      privateStateId: VOUCH_PRIVATE_STATE_ID,
      initialPrivateState: privateState,
    });
    const slot = AGENT_SLOT_BY_TYPE[agentType];
    const authorize = [
      deployed.callTx.authorizeTaskAgent,
      deployed.callTx.authorizeResearchAgent,
      deployed.callTx.authorizeDeveloperAgent,
      deployed.callTx.authorizeCustomAgent,
    ][slot];
    if (typeof authorize !== 'function') throw new VouchExecutionError('execution-failed', `No authorization circuit is configured for ${agentType} agents.`);
    try {
      const finalized = await authorize(commitmentForSecret(agentSecret));
      return finalized.public.txId;
    } catch (error) {
      throw classifyCircuitError(error, 'Midnight rejected agent authorization.');
    }
  }

  async authorizeSpend(
    request: VouchExecutionRequest,
    authorization: Pick<AuthorizationService, 'authorize'> = this.authorization,
  ): Promise<SuccessfulVouchExecution> {
    const decision = authorization.authorize({ intent: request.intent });
    if (decision.decision !== 'allowed') {
      throw new VouchExecutionError('pre-validation-rejected', decision.reason);
    }
    if (request.intent.action !== 'spend') {
      throw new VouchExecutionError('execution-failed', 'Only spend intents can be executed by this service.');
    }
    const wallet = this.requireLegacyWallet();
    const recipientCommitment = commitmentForPolicyValue(request.intent.recipient.trim());
    const categoryCommitment = commitmentForPolicyValue(request.intent.category.trim());

    const deployment = getDeployment(this.network);
    if (!deployment) {
      throw new VouchExecutionError('contract-not-deployed', `No Vouch contract deployment is recorded for ${this.network}.`);
    }

    if (request.intent.agentId.trim() === '' || request.agentSecret.length !== 32) {
      throw new VouchExecutionError('execution-failed', 'A valid private identity is required for execution.');
    }
    const privateState = loadVouchPrivateState(request.agentSecrets);
    assertPrivateStateShape(privateState);
    // Unscoped private state (see note in authorizeAgent). Application-level
    // agent/user scoping in the authorization layer is unaffected.
    const providers = createVouchProviders(wallet, this.network, this.networkConfig);

    let deployed: Awaited<ReturnType<typeof findDeployedContract>>;
    try {
      // See the provider typing note in deploy.ts: Midnight.js 4.1.x exposes
      // verifier IDs as string while generated circuits use literal names.
      deployed = await findDeployedContract(providers as any, {
        compiledContract: compiledVouchPolicy,
        contractAddress: deployment.address,
        privateStateId: VOUCH_PRIVATE_STATE_ID,
        initialPrivateState: privateState,
      });
    } catch (error) {
      throw new VouchExecutionError('contract-lookup-failed', 'Unable to load the deployed Vouch contract.', { cause: error });
    }

    const slot = AGENT_SLOT_BY_TYPE[request.agentType];
    const authorize = [
      deployed.callTx.authorizeTaskAgent,
      deployed.callTx.authorizeResearchAgent,
      deployed.callTx.authorizeDeveloperAgent,
      deployed.callTx.authorizeCustomAgent,
    ][slot];
    const spend = [
      deployed.callTx.requestTaskSpend,
      deployed.callTx.requestResearchSpend,
      deployed.callTx.requestDeveloperSpend,
      deployed.callTx.requestCustomSpend,
    ][slot];
    if (typeof authorize !== 'function' || typeof spend !== 'function') {
      throw new VouchExecutionError('execution-failed', `No Midnight circuit is configured for ${request.agentType} agents.`);
    }
    try {
      await authorize(commitmentForSecret(request.agentSecret));
    } catch (error) {
      throw classifyCircuitError(
        error,
        'Midnight rejected agent authorization.',
      );
    }

    try {
      const finalized = await spend(
        BigInt(request.intent.amount),
        recipientCommitment,
        categoryCommitment,
      );
      return {
        status: 'confirmed',
        contractAddress: deployment.address,
        transactionId: finalized.public.txId,
        intent: request.intent,
      };
    } catch (error) {
      throw classifyCircuitError(error, 'Midnight rejected the Vouch authorization request.');
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private requireDeployment() {
    const deployment = getDeployment(this.network);
    if (!deployment) throw new VouchExecutionError('contract-not-deployed', `No Vouch contract deployment is recorded for ${this.network}.`);
    return deployment;
  }

  private requireLegacyWallet(): WalletContext {
    if (!this.wallet) throw new VouchExecutionError('wallet-unavailable', 'This execution service was created without a backend wallet; use the browser-wallet transaction flow.');
    return this.wallet;
  }

  private authorizationCircuitId(agentType: AgentType): string {
    const circuitId = AUTHORIZATION_CIRCUITS[AGENT_SLOT_BY_TYPE[agentType]];
    if (!circuitId) throw new VouchExecutionError('execution-failed', `No authorization circuit is configured for ${agentType} agents.`);
    return circuitId;
  }

  private spendCircuitId(agentType: AgentType): string {
    const circuitId = SPEND_CIRCUITS[AGENT_SLOT_BY_TYPE[agentType]];
    if (!circuitId) throw new VouchExecutionError('execution-failed', `No Midnight circuit is configured for ${agentType} agents.`);
    return circuitId;
  }

  private privateStateForAgent(
    agentType: AgentType,
    agentSecret: Uint8Array,
  ): ReturnType<typeof loadVouchPrivateState> {
    const secrets: [Uint8Array, Uint8Array, Uint8Array, Uint8Array] = [
      new Uint8Array(32),
      new Uint8Array(32),
      new Uint8Array(32),
      new Uint8Array(32),
    ];
    secrets[AGENT_SLOT_BY_TYPE[agentType]] = new Uint8Array(agentSecret);
    const privateState = loadVouchPrivateState(secrets);
    assertPrivateStateShape(privateState);
    return privateState;
  }

  /**
   * The build-only provider assembly: indexer public state, server-held
   * private state, local proof server, ZK artifacts. No wallet providers —
   * balancing/signing happens in the user's DApp-connector wallet, which pays
   * the fees and relays the sealed transaction.
   */
  private async buildAndProveUnboundTx(input: {
    readonly circuitId: string;
    readonly args: unknown[];
    readonly initialPrivateState: ReturnType<typeof loadVouchPrivateState>;
    readonly browserKeys: VouchBrowserWalletKeys;
    readonly contractAddress: string;
  }): Promise<VouchPendingTransaction> {
    // The Midnight private state is always the deployed, unscoped Vouch store;
    // user/agent scoping is application-level only (pending registry + repos).
    const providers = createVouchCallTxProviders(this.network, this.networkConfig);
    const publicStates = await providers.publicDataProvider.queryZSwapAndContractState(input.contractAddress);
    if (!publicStates) {
      throw new VouchExecutionError('contract-lookup-failed', 'Unable to load the deployed Vouch contract state from the Preprod indexer.');
    }
    const [initialZswapChainState, initialContractState, ledgerParameters] = publicStates;

    // The transaction must belong to the wallet that will balance and sign it,
    // so the connected user's public keys are used here. They are public
    // values from the DApp connector's getShieldedAddresses(); no secret
    // material crosses the backend/browser boundary.
    const coinPublicKey = parseCoinPublicKeyToHex(input.browserKeys.coinPublicKey, getNetworkId());
    const walletEncryptionPublicKey = parseEncPublicKeyToHex(input.browserKeys.encryptionPublicKey, getNetworkId());

    const unproven = await createUnprovenCallTxFromInitialStates(
      providers.zkConfigProvider,
      {
        compiledContract: compiledVouchPolicy,
        contractAddress: input.contractAddress,
        circuitId: input.circuitId,
        args: input.args,
        initialPrivateState: input.initialPrivateState,
        coinPublicKey,
        initialContractState,
        initialZswapChainState,
        ledgerParameters,
      } as never,
      walletEncryptionPublicKey,
    );

    let proven;
    try {
      proven = await providers.proofProvider.proveTx(unproven.private.unprovenTx);
    } catch (error) {
      throw new VouchExecutionError('proof-generation-failed', 'Midnight proof generation failed.', { cause: error });
    }

    return {
      pendingTransactionId: randomUUID(),
      transactionKind: input.circuitId.startsWith('authorize') ? 'agent-authorization' : 'spend-authorization',
      unboundTxHex: toHex(proven.serialize()),
      circuitId: input.circuitId,
      contractAddress: input.contractAddress,
      expiresAt: new Date(Date.now() + PENDING_TRANSACTION_TTL_MS).toISOString(),
    };
  }

  private async buildSpendRequestTransaction(data: PendingSpendAuthorization): Promise<VouchPendingTransaction> {
    const deployment = this.requireDeployment();
    const pendingTransaction = await this.buildAndProveUnboundTx({
      circuitId: this.spendCircuitId(data.agentType),
      args: [data.amount, data.recipientCommitment, data.categoryCommitment],
      initialPrivateState: data.initialPrivateState,
      browserKeys: data.browserKeys,
      contractAddress: deployment.address,
    });
    this.pending.set(pendingTransaction.pendingTransactionId, {
      data: {
        kind: 'spend-request',
        userId: data.userId,
        agentId: data.agentId,
        agentType: data.agentType,
        agentSecret: data.agentSecret,
        amount: data.amount,
        browserKeys: data.browserKeys,
        initialPrivateState: data.initialPrivateState,
      },
      expiresAt: Date.now() + PENDING_TRANSACTION_TTL_MS,
    });
    return pendingTransaction;
  }

  private takePendingRecord(pendingTransactionId: string): PendingRecord {
    this.pruneExpiredPending();
    const pending = this.pending.get(pendingTransactionId);
    if (!pending) {
      throw new VouchExecutionError('pending-transaction-not-found', 'The pending transaction was not found or has expired. Restart the request.');
    }
    this.pending.delete(pendingTransactionId);
    return pending;
  }

  private restorePendingRecord(pendingTransactionId: string, pending: PendingRecord): void {
    this.pending.set(pendingTransactionId, pending);
  }

  private pruneExpiredPending(): void {
    const now = Date.now();
    for (const [id, pending] of this.pending) {
      if (pending.expiresAt < now) this.pending.delete(id);
    }
  }

  /**
   * Keeps the server-held Compact private state store consistent with the
   * submitted transaction, exactly as Midnight.js would have after a
   * server-side `callTx` (the getPolicy witness advances spentToday; the
   * authorize circuits leave private state unchanged). The authoritative
   * application accounting remains the repository/AuthorizationService.
   */
  private async persistPrivateState(
    providers: ReturnType<typeof createVouchCallTxProviders>,
    contractAddress: string,
    state: ReturnType<typeof loadVouchPrivateState>,
  ): Promise<void> {
    try {
      providers.privateStateProvider.setContractAddress(contractAddress);
      await providers.privateStateProvider.set(VOUCH_PRIVATE_STATE_ID, state);
    } catch {
      // Private-state persistence is a consistency nicety here, not the
      // authorization path: the app repository records authoritative policy
      // accounting, and every build supplies fresh private state from
      // server-held secrets. A failed write must not fail a confirmed
      // on-chain transaction.
    }
  }
}

async function withConfirmationTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new VouchExecutionError('confirmation-timeout', `The transaction was not visible to the Preprod indexer within ${CONFIRMATION_TIMEOUT_MS / 1000} seconds.`)),
      CONFIRMATION_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function classifyCircuitError(error: unknown, rejectedMessage: string): VouchExecutionError {
  if (error instanceof VouchExecutionError) return error;
  if (error instanceof CallTxFailedError) {
    return new VouchExecutionError('transaction-rejected', rejectedMessage, { cause: error });
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('proof') || message.includes('prover')) {
    return new VouchExecutionError('proof-generation-failed', 'Midnight proof generation failed.', { cause: error });
  }
  if (message.includes('submit') || message.includes('relay') || message.includes('node')) {
    return new VouchExecutionError('transaction-submission-failed', 'Midnight transaction submission failed.', { cause: error });
  }
  return new VouchExecutionError('execution-failed', 'Vouch authorization execution failed.', { cause: error });
}

export type VouchExecutionAdapter = Pick<
  VouchExecutionService,
  'createAgentAuthorizationTransaction' | 'createSpendAuthorizationTransaction' | 'confirmPendingTransaction' | 'describePending'
>;

export async function createVouchExecutionService(
  authorization: Pick<AuthorizationService, 'authorize'>,
  network: NetworkId,
  networkConfig: NetworkConfig,
  wallet?: WalletContext,
): Promise<VouchExecutionService> {
  return new VouchExecutionService(authorization, network, networkConfig, wallet);
}
