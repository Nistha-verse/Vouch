import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { Bytes32Descriptor, persistentHash } from '@midnight-ntwrk/compact-runtime';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { createHash } from 'node:crypto';
import type { VouchPrivateState } from '../vouch-policy-witnesses.js';
import type { NetworkConfig, NetworkId } from '../network.js';
import { loadState, STATE_FILE_NAME } from '../network.js';
import { deriveWalletAddress } from '../wallet.js';
import type { WalletContext } from '../wallet.js';

// @ts-expect-error Required for wallet sync.
globalThis.WebSocket = WebSocket;

export const VOUCH_PRIVATE_STATE_ID = 'vouchPolicyPrivateState';

export function commitmentForSecret(secret: Uint8Array): Uint8Array {
  return persistentHash(Bytes32Descriptor, secret);
}

/**
 * This is the single application-to-Midnight representation for policy text.
 * The exact canonical UTF-8 bytes are hashed with SHA-256, producing the
 * 32-byte value expected by the existing Compact contract.
 */
export function commitmentForPolicyValue(value: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(value, 'utf8').digest());
}

function privateStatePassword(): string {
  const password = process.env.PRIVATE_STATE_PASSWORD?.trim();
  if (!password || password.length < 16) {
    throw new Error('PRIVATE_STATE_PASSWORD must be set to at least 16 characters.');
  }
  return password;
}

/**
 * Level private-state accountId of the deployed Vouch contract's private
 * state: the deployment wallet's bech32 address — the same value
 * createVouchProviders used at deploy time (deploy.ts records it as the
 * deployment's `deployer`). Derived from the deployment seed so it can be
 * resolved without a synchronized wallet.
 */
export function deploymentWalletAccountId(network: NetworkId): string {
  const state = loadState({ cwd: process.cwd() });
  const wallet = state?.wallets?.[network];
  const deployment = state?.deployments?.[network];
  if (deployment?.deployer) return deployment.deployer;
  if (wallet?.seed) return deriveWalletAddress(wallet.seed, network);
  throw new Error(
    `No ${network} deployment or wallet is recorded in ${STATE_FILE_NAME}; the Vouch private state cannot be located. Run the deployment first.`,
  );
}

/**
 * Providers for the browser-wallet transaction split: the backend only builds
 * and proves unbound call transactions, so no wallet providers are involved.
 * Balancing/signing happens in the user's DApp-connector wallet and submission
 * is relayed by the wallet extension.
 */
export function createVouchCallTxProviders(
  network: NetworkId,
  networkConfig: NetworkConfig,
) {
  const password = privateStatePassword();

  // Midnight.js circuit simulation resolves bech32 values against the ambient
  // network id. The server no longer constructs a wallet (which used to set
  // this), so it must be set explicitly before any transaction is built.
  setNetworkId(network);

  const zkConfigPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'contracts', 'managed', 'vouch-policy');

  // The deployed contract was initialized with the unscoped Vouch private
  // state under the deployment wallet's account (see createVouchProviders and
  // deploy.ts). The browser split must resolve Compact witnesses against that
  // same private-state identity — a scoped per-user/per-agent namespace here
  // would make getOwnerSecret() read secrets that do not match the deployed
  // ownerCommitment, failing with "Only the owner can authorize an agent".
  // The deployer address is the deployment-time accountId, recorded in
  // .midnight-state.json; deriving it from the deployment seed yields the
  // same value without spinning up a synchronized wallet.
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: `${VOUCH_PRIVATE_STATE_ID}-${network}`,
      accountId: deploymentWalletAccountId(network),
      privateStoragePasswordProvider: () => password,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider: new NodeZkConfigProvider(zkConfigPath),
    proofProvider: httpClientProofProvider(networkConfig.proofServer, new NodeZkConfigProvider(zkConfigPath)),
  };
}

export function createVouchProviders(
  walletCtx: WalletContext,
  network: NetworkId,
  networkConfig: NetworkConfig,
  privateStateScope?: string,
) {
  const password = privateStatePassword();

  const walletProvider = {
    getCoinPublicKey: () => walletCtx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx),
  };

  const zkConfigPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'contracts', 'managed', 'vouch-policy');
  const walletAccountId = walletCtx.unshieldedKeystore.getBech32Address().toString();
  const scopeHash = privateStateScope
    ? createHash('sha256').update(privateStateScope, 'utf8').digest('hex')
    : undefined;
  const accountId = scopeHash ? `${walletAccountId}-${scopeHash}` : walletAccountId;

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: `${VOUCH_PRIVATE_STATE_ID}-${network}${scopeHash ? `-${scopeHash}` : ''}`,
      accountId,
      privateStoragePasswordProvider: () => password,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider: new NodeZkConfigProvider(zkConfigPath),
    proofProvider: httpClientProofProvider(networkConfig.proofServer, new NodeZkConfigProvider(zkConfigPath)),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

export type VouchProviders = ReturnType<typeof createVouchProviders>;

export function assertPrivateStateShape(state: VouchPrivateState): void {
  if (
    state.ownerSecret.length !== 32
    || state.agentSecrets.some((secret) => secret.length !== 32)
  ) {
    throw new Error('Vouch private state contains invalid secret values.');
  }
}
