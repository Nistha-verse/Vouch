import { Transaction } from '@midnight-ntwrk/ledger-v8';
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

function hexToBytes(value: string): Uint8Array {
  if (!/^[0-9a-fA-F]*$/.test(value) || value.length % 2 !== 0) throw new Error('The backend returned a malformed transaction.');
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let result = '';
  for (const byte of bytes) result += byte.toString(16).padStart(2, '0');
  return result;
}

/**
 * Browser half of the transaction split: hands the backend-built unbound
 * transaction to the connected DApp-connector wallet for balancing and signing
 * (`balanceUnsealedTransaction`), then submits it through the wallet's relay
 * (`submitTransaction`) and derives the transaction ID from the sealed
 * transaction's identifiers. Mirrors the connector flow already used by the
 * deployment page. The wallet approval popup appears during balancing.
 */
export async function balanceAndSubmitUnboundTransaction(
  connection: WalletConnection,
  unboundTxHex: string,
): Promise<string> {
  if (!connection.api) throw new Error('The connected wallet does not expose its transaction API.');
  const api = connection.api;
  const unbound = Transaction.deserialize('signature', 'proof', 'pre-binding', hexToBytes(unboundTxHex));
  const balanced = await api.balanceUnsealedTransaction(bytesToHex(unbound.serialize()));
  const sealed = Transaction.deserialize('signature', 'proof', 'binding', hexToBytes(balanced.tx));
  await api.submitTransaction(balanced.tx);
  const identifiers = sealed.identifiers().map(String).filter((id) => id.trim() !== '');
  const transactionId = identifiers.at(-1) ?? identifiers[0];
  if (!transactionId) throw new Error('The wallet did not return a transaction identifier.');
  return transactionId;
}

/** Public keys of the connected wallet, used by the backend to address the transaction to it. */
export async function connectedWalletKeys(connection: WalletConnection): Promise<{ coinPublicKey: string; encryptionPublicKey: string }> {
  if (!connection.api) throw new Error('The connected wallet does not expose its transaction API.');
  const addresses = await connection.api.getShieldedAddresses();
  return { coinPublicKey: addresses.shieldedCoinPublicKey, encryptionPublicKey: addresses.shieldedEncryptionPublicKey };
}
