// Wallet construction + sync-state restore.
//
// Mirrors network.ts in structure. The on-disk format and pure I/O live in
// wallet-state.ts (unit-tested from the scaffolder workspace, no SDK deps);
// this file is the glue between that format and the wallet SDK.

import { Buffer } from 'buffer';
import * as Rx from 'rxjs';

// Ledger types now come from the midnight-js-protocol barrel, which re-exports
// ledger-v8 (8.1.0) under a stable subpath instead of depending on it directly.
import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
// As of Midnight.js 4.1.x / ledger-v8 8.1.0 the wallet SDK is consolidated behind
// the single @midnight-ntwrk/wallet-sdk barrel, which re-exports the former
// wallet-sdk-facade / -hd / -shielded / -dust-wallet / -unshielded-wallet packages.
import {
  WalletFacade,
  DustWallet,
  HDWallet,
  Roles,
  ShieldedWallet,
  createKeystore,
  NoOpTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
} from '@midnight-ntwrk/wallet-sdk';

import type { NetworkConfig, NetworkId } from './network';
import {
  CHILD_KINDS,
  loadWalletState,
  saveWalletState,
  type ChildKind,
  type PersistedWalletState,
} from './wallet-state.js';

export { unshieldedToken };
export type { PersistedWalletState };
export {
  loadWalletState,
  saveWalletState,
  clearWalletState,
  quarantineWalletState,
  WALLET_STATE_DIR,
  WALLET_STATE_VERSION,
} from './wallet-state.js';

function deriveKeys(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');
  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (result.type !== 'keysDerived') throw new Error('Key derivation failed');
  hdWallet.hdWallet.clear();
  return result.keys;
}

export interface WalletContext {
  wallet: Awaited<ReturnType<typeof WalletFacade.init>>;
  shieldedSecretKeys: ReturnType<typeof ledger.ZswapSecretKeys.fromSeed>;
  dustSecretKey: ReturnType<typeof ledger.DustSecretKey.fromSeed>;
  unshieldedKeystore: ReturnType<typeof createKeystore>;
  restored: { shielded: boolean; unshielded: boolean; dust: boolean };
}

export interface WalletSyncOptions {
  readonly maxDurationMs?: number;
  readonly inactivityTimeoutMs?: number;
  readonly diagnosticIntervalMs?: number;
  readonly onDiagnostic?: (message: string) => void;
}

export class WalletSyncStalledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletSyncStalledError';
  }
}

export interface CreateWalletOptions {
  network: NetworkId;
  networkConfig: NetworkConfig;
  seed: string;
  /**
   * Whether to attempt to restore each child wallet from saved state.
   * Defaults to true. Pass false to force a from-seed sync (used by tests).
   */
  restore?: boolean;
  cwd?: string;
}

function warnRestoreFailure(kind: ChildKind, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`  ⚠ Could not restore ${kind} wallet state (${msg}); falling back to fresh sync.\n`);
}

function parseSavedSnapshot(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const snapshot: unknown = JSON.parse(value);
    return snapshot && typeof snapshot === 'object' ? snapshot as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function savedStateMatchesWallet(
  kind: ChildKind,
  value: unknown,
  networkId: string,
  shieldedSecretKeys: ReturnType<typeof ledger.ZswapSecretKeys.fromSeed>,
  unshieldedAddress: string,
  dustSecretKey: ReturnType<typeof ledger.DustSecretKey.fromSeed>,
): boolean {
  const snapshot = parseSavedSnapshot(value);
  if (!snapshot || snapshot.networkId !== networkId) return false;

  if (kind === 'shielded') {
    const keys = snapshot.publicKeys as Record<string, unknown> | undefined;
    return keys?.coinPublicKey === String(shieldedSecretKeys.coinPublicKey)
      && keys.encryptionPublicKey === String(shieldedSecretKeys.encryptionPublicKey);
  }
  if (kind === 'unshielded') {
    const key = snapshot.publicKey as Record<string, unknown> | undefined;
    return key?.address === unshieldedAddress;
  }
  const key = snapshot.publicKey as Record<string, unknown> | undefined;
  return String(key?.publicKey ?? '') === String(dustSecretKey.publicKey);
}

/**
 * Build the wallet facade, restoring each child from saved state when
 * available and falling back to a from-seed start when not (or when restore
 * throws, e.g. after an SDK upgrade with an incompatible state format).
 *
 * Caller is responsible for `await wallet.waitForSyncedState()` afterwards.
 */
export async function createWallet(opts: CreateWalletOptions): Promise<WalletContext> {
  setNetworkId(opts.networkConfig.networkId);

  const keys = deriveKeys(opts.seed);
  const networkId = getNetworkId();
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);
  const unshieldedAddress = unshieldedKeystore.getBech32Address().toString();

  const saved: PersistedWalletState = opts.restore === false
    ? {}
    : loadWalletState(opts.network, { cwd: opts.cwd });

  const restored = { shielded: false, unshielded: false, dust: false };
  for (const kind of CHILD_KINDS) {
    if (saved[kind] !== undefined && !savedStateMatchesWallet(
      kind,
      saved[kind],
      networkId,
      shieldedSecretKeys,
      unshieldedAddress,
      dustSecretKey,
    )) {
      warnRestoreFailure(kind, new Error('saved state belongs to a different wallet or network'));
      delete saved[kind];
    }
  }

  const walletConfig = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: opts.networkConfig.indexer,
      indexerWsUrl: opts.networkConfig.indexerWS,
      bufferSize: 10_000,
      resumeThreshold: 1_000,
    },
    batchUpdates: { size: 250, timeout: 1, spacing: 0 },
    provingServerUrl: new URL(opts.networkConfig.proofServer),
    relayURL: new URL(opts.networkConfig.node.replace(/^http/, 'ws')),
    txHistoryStorage: new NoOpTransactionHistoryStorage(),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  };

  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded: async (config) => {
      const cls = ShieldedWallet(config);
      if (saved.shielded !== undefined) {
        try {
          const restoredWallet = await (cls as any).restore(saved.shielded);
          restored.shielded = true;
          return restoredWallet;
        } catch (err) {
          warnRestoreFailure('shielded', err);
        }
      }
      return cls.startWithSecretKeys(shieldedSecretKeys);
    },
    unshielded: async (config) => {
      const cls = UnshieldedWallet(config);
      if (saved.unshielded !== undefined) {
        try {
          const restoredWallet = await (cls as any).restore(saved.unshielded);
          restored.unshielded = true;
          return restoredWallet;
        } catch (err) {
          warnRestoreFailure('unshielded', err);
        }
      }
      return cls.startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore));
    },
    dust: async (config) => {
      const cls = DustWallet(config);
      if (saved.dust !== undefined) {
        try {
          const restoredWallet = await (cls as any).restore(saved.dust);
          restored.dust = true;
          return restoredWallet;
        } catch (err) {
          warnRestoreFailure('dust', err);
        }
      }
      return cls.startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust);
    },
  });

  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore, restored };
}

export async function waitForWalletSync(
  wallet: WalletContext['wallet'],
  options: WalletSyncOptions = {},
): Promise<Awaited<ReturnType<WalletContext['wallet']['waitForSyncedState']>>> {
  const maxDurationMs = options.maxDurationMs ?? 2 * 60 * 60 * 1000;
  const inactivityTimeoutMs = options.inactivityTimeoutMs ?? 2 * 60 * 1000;
  const diagnosticIntervalMs = options.diagnosticIntervalMs ?? 15_000;
  let lastProgress = '';
  let lastProgressAt = Date.now();

  const summarize = (state: Awaited<ReturnType<WalletContext['wallet']['waitForSyncedState']>>) => {
    const progress = (value: { isStrictlyComplete(): boolean; isConnected: boolean }) => {
      const fields = Object.entries(value as object)
        .filter(([key, item]) => key !== 'isStrictlyComplete' && typeof item === 'bigint')
        .map(([key, item]) => `${key}=${String(item)}`)
        .join(',');
      return `${value.isStrictlyComplete() ? 'complete' : 'catching-up'};connected=${value.isConnected};${fields}`;
    };
    return [
      `shielded[${progress(state.shielded.state.progress)}]`,
      `unshielded[${progress(state.unshielded.progress)}]`,
      `dust[${progress(state.dust.state.progress)}]`,
    ].join(' ');
  };

  let snapshot = '';
  const subscription = wallet.state().subscribe((state) => {
    snapshot = summarize(state);
    if (snapshot !== lastProgress) {
      lastProgress = snapshot;
      lastProgressAt = Date.now();
    }
  });

  const startedAt = Date.now();
  let interval: ReturnType<typeof setInterval> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const idle = Date.now() - lastProgressAt;
      options.onDiagnostic?.(`Sync status (${Math.round(elapsed / 1000)}s): ${snapshot || 'waiting for first SDK state'}; no progress ${Math.round(idle / 1000)}s.`);
      if (elapsed >= maxDurationMs) {
        reject(new WalletSyncStalledError(`Wallet sync exceeded ${Math.round(maxDurationMs / 1000)} seconds. ${snapshot}`));
      } else if (idle >= inactivityTimeoutMs) {
        reject(new WalletSyncStalledError(`Wallet sync made no progress for ${Math.round(inactivityTimeoutMs / 1000)} seconds. ${snapshot}`));
      }
    }, Math.min(diagnosticIntervalMs, 5_000));
  });

  try {
    return await Promise.race([wallet.waitForSyncedState(), timeout]);
  } finally {
    subscription.unsubscribe();
    if (interval) clearInterval(interval);
  }
}

export function deriveWalletAddress(seed: string, networkId: NetworkId): string {
  const keys = deriveKeys(seed);
  return createKeystore(keys[Roles.NightExternal], networkId).getBech32Address().toString();
}

/**
 * Serialize each child wallet's current state and persist it for the next run.
 * Safe to call multiple times. Logs but does not throw on individual failures —
 * losing one child's state means the next run re-syncs that child only.
 */
export async function persistWalletState(
  network: NetworkId,
  ctx: WalletContext,
  cwd?: string,
): Promise<void> {
  const next: PersistedWalletState = {};

  for (const kind of CHILD_KINDS) {
    try {
      const child = (ctx.wallet as unknown as Record<ChildKind, { serializeState: () => Promise<unknown> }>)[kind];
      const serialized = await child.serializeState();
      if (kind === 'dust') {
        next.dust = serialized as string;
      } else {
        next[kind] = serialized;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  ⚠ Could not serialize ${kind} wallet state (${msg}); next run will re-sync.\n`);
    }
  }

  saveWalletState(network, next, { cwd });
}
