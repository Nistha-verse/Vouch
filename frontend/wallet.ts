import { createWalletConnectionManager, type WalletConnection, type WalletConnectionManager, type WalletDescriptor } from '../src/wallet/index.js';

export interface WalletState {
  manager: WalletConnectionManager | null;
  wallets: WalletDescriptor[];
  connection: WalletConnection | null;
  error: string | null;
}

export function discoverWallets(): WalletState {
  const result = createWalletConnectionManager();
  if (!result.ok) return { manager: null, wallets: [], connection: null, error: result.error.message };
  return { manager: result.value, wallets: result.value.getWallets(), connection: null, error: null };
}
