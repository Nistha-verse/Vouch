import { createWalletConnectionManager, type WalletConnection, type WalletConnectionManager, type WalletDescriptor } from '../src/wallet/index.js';
import { api, clearSessionToken, setSessionToken } from './api';

export interface WalletState {
  manager: WalletConnectionManager | null;
  wallets: WalletDescriptor[];
  connection: WalletConnection | null;
  error: string | null;
  sessionToken: string | null;
  userId: string | null;
  address: string | null;
  status: 'disconnected' | 'connecting' | 'connected' | 'authenticated';
}

export function discoverWallets(): WalletState {
  const result = createWalletConnectionManager();
  if (!result.ok) return { manager: null, wallets: [], connection: null, error: result.error.message, sessionToken: null, userId: null, address: null, status: 'disconnected' };
  return { manager: result.value, wallets: result.value.getWallets(), connection: null, error: null, sessionToken: null, userId: null, address: null, status: 'disconnected' };
}

export async function authenticateWallet(connection: WalletConnection): Promise<{ token: string; userId: string }> {
  clearSessionToken();
  try {
    if (!connection.api) throw new Error('The connected wallet does not expose its signing API.');
    const challenge = await api.challenge();
    const signature = await connection.api.signData(challenge.challenge, { encoding: 'text', keyType: 'unshielded' });
    const session = await api.verify(challenge.challenge, signature);
    if (!session.token) throw new Error('Wallet authentication did not return a session token.');
    setSessionToken(session.token);
    return { token: session.token, userId: session.userId };
  } catch (error) {
    clearSessionToken();
    throw error;
  }
}
