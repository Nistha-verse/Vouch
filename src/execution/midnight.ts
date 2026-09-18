import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { Bytes32Descriptor, persistentHash } from '@midnight-ntwrk/compact-runtime';
import type { VouchPrivateState } from '../vouch-policy-witnesses.js';
import type { NetworkConfig, NetworkId } from '../network.js';
import type { WalletContext } from '../wallet.js';

// @ts-expect-error Required for wallet sync.
globalThis.WebSocket = WebSocket;

export const VOUCH_PRIVATE_STATE_ID = 'vouchPolicyPrivateState';

export function commitmentForSecret(secret: Uint8Array): Uint8Array {
  return persistentHash(Bytes32Descriptor, secret);
}

export function createVouchProviders(
  walletCtx: WalletContext,
  network: NetworkId,
  networkConfig: NetworkConfig,
) {
  const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD?.trim();
  if (!privateStatePassword || privateStatePassword.length < 16) {
    throw new Error('PRIVATE_STATE_PASSWORD must be set to at least 16 characters.');
  }

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
  const accountId = walletCtx.unshieldedKeystore.getBech32Address().toString();

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: `${VOUCH_PRIVATE_STATE_ID}-${network}`,
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
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
    || state.agentSecret.length !== 32
    || state.allowedRecipientCommitment.length !== 32
    || state.allowedCategoryCommitment.length !== 32
  ) {
    throw new Error('Vouch private state contains invalid fixed-size values.');
  }
}
