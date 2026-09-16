import assert from 'node:assert/strict';

import { WalletConnectionManager } from './index.js';

const lace = {
  rdns: 'com.lace.wallet',
  name: 'Lace',
  icon: 'https://example.invalid/lace.png',
  apiVersion: '4.0.1',
  connect: async () => ({
    getConfiguration: async () => ({
      networkId: 'preprod',
      indexerUri: 'https://indexer.preprod',
      indexerWsUri: 'wss://indexer.preprod/ws',
      substrateNodeUri: 'https://node.preprod',
      proverServerUri: 'https://prover.preprod',
    }),
    getConnectionStatus: async () => ({ status: 'connected', networkId: 'preprod' } as const),
    getShieldedBalances: async () => ({}) as Record<string, bigint>,
    getUnshieldedBalances: async () => ({}) as Record<string, bigint>,
    getDustBalance: async () => ({ cap: 0n, balance: 0n }),
    getShieldedAddresses: async () => ({ shieldedAddress: 'addr1', shieldedCoinPublicKey: 'coin', shieldedEncryptionPublicKey: 'enc' }),
    getUnshieldedAddress: async () => ({ unshieldedAddress: 'addr2' }),
    getDustAddress: async () => ({ dustAddress: 'addr3' }),
    getTxHistory: async () => [],
    balanceUnsealedTransaction: async () => ({ tx: '0x1' }),
    balanceSealedTransaction: async () => ({ tx: '0x2' }),
    makeTransfer: async () => ({ tx: '0x3' }),
    makeIntent: async () => ({ tx: '0x4' }),
    signData: async () => ({ data: '0x0', signature: 'sig', verifyingKey: 'key' }),
    submitTransaction: async () => undefined,
    getProvingProvider: async () => ({ check: async () => [], prove: async () => new Uint8Array() }),
    hintUsage: async () => undefined,
  }) as any,
} as any;

const oneAM = {
  rdns: 'com.oneam.wallet',
  name: '1AM',
  icon: 'https://example.invalid/1am.png',
  apiVersion: '4.0.1',
  connect: async () => ({
    getConfiguration: async () => ({
      networkId: 'preview',
      indexerUri: 'https://indexer.preview',
      indexerWsUri: 'wss://indexer.preview/ws',
      substrateNodeUri: 'https://node.preview',
    }),
    getConnectionStatus: async () => ({ status: 'connected', networkId: 'preview' } as const),
    getShieldedBalances: async () => ({}) as Record<string, bigint>,
    getUnshieldedBalances: async () => ({}) as Record<string, bigint>,
    getDustBalance: async () => ({ cap: 0n, balance: 0n }),
    getShieldedAddresses: async () => ({ shieldedAddress: 'addr1', shieldedCoinPublicKey: 'coin', shieldedEncryptionPublicKey: 'enc' }),
    getUnshieldedAddress: async () => ({ unshieldedAddress: 'addr2' }),
    getDustAddress: async () => ({ dustAddress: 'addr3' }),
    getTxHistory: async () => [],
    balanceUnsealedTransaction: async () => ({ tx: '0x1' }),
    balanceSealedTransaction: async () => ({ tx: '0x2' }),
    makeTransfer: async () => ({ tx: '0x3' }),
    makeIntent: async () => ({ tx: '0x4' }),
    signData: async () => ({ data: '0x0', signature: 'sig', verifyingKey: 'key' }),
    submitTransaction: async () => undefined,
    getProvingProvider: async () => ({ check: async () => [], prove: async () => new Uint8Array() }),
    hintUsage: async () => undefined,
  }) as any,
} as any;

const manager = new WalletConnectionManager([
  {
    id: 'lace',
    rdns: lace.rdns,
    name: lace.name,
    icon: lace.icon,
    apiVersion: lace.apiVersion,
    provider: lace,
    status: 'available',
  },
  {
    id: 'oneam',
    rdns: oneAM.rdns,
    name: oneAM.name,
    icon: oneAM.icon,
    apiVersion: oneAM.apiVersion,
    provider: oneAM,
    status: 'available',
  },
]);

assert.equal(manager.listAvailableWallets().length, 2);
assert.equal(manager.listAvailableWallets()[0].name, 'Lace');
assert.equal(manager.listAvailableWallets()[1].name, '1AM');

const selected = manager.selectWallet('oneam');
assert.equal(selected.ok, true);
if (selected.ok) {
  assert.equal(selected.value.rdns, 'com.oneam.wallet');
}

const connected = await manager.connectWallet('oneam');
assert.equal(connected.ok, false);
if (!connected.ok) {
  assert.equal(connected.error.code, 'incompatible-network');
}

const managerWithNone = new WalletConnectionManager();
assert.deepEqual(managerWithNone.listAvailableWallets(), []);
assert.equal(managerWithNone.getSelection(), null);

const noWallets = await new WalletConnectionManager().connectWallet('missing-wallet');
assert.equal(noWallets.ok, false);
if (!noWallets.ok) {
  assert.equal(noWallets.error.code, 'wallet-not-available');
}

const connection = await manager.connectWallet('lace');
assert.equal(connection.ok, true);
if (!connection.ok) {
  throw new Error('Expected Lace connection to succeed');
}
assert.equal(connection.value.walletName, 'Lace');
assert.equal(connection.value.status, 'connected');
assert.equal('seedPhrase' in connection.value, false);
assert.equal('privateKey' in connection.value, false);
assert.equal('ownerSecret' in connection.value, false);
assert.equal('agentSecret' in connection.value, false);

console.log('Wallet connection validation passed.');
