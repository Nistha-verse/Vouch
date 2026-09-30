import { useMemo, useState } from 'react';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { createProofProvider } from '@midnight-ntwrk/midnight-js-types';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { Transaction } from '@midnight-ntwrk/ledger-v8';
import * as VouchPolicyContract from '../contracts/managed/vouch-policy/contract/index.js';
import { createVouchPrivateState, witnesses, type VouchPrivateState } from '../src/vouch-policy-witnesses.js';

const NETWORK = 'preprod';
const ZK_BASE = '/__vouch-zk';
const ZK = new FetchZkConfigProvider(`${window.location.origin}${ZK_BASE}`);
const compiledVouchPolicy = CompiledContract.make('vouch-policy', VouchPolicyContract.Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets('/contracts/managed/vouch-policy'),
);

type Connector = { name: string; rdns: string; provider: InitialAPI };
type FormState = {
  ownerSecret: string;
  agentSecrets: [string, string, string, string];
  dailyLimit: string;
  perTransactionLimit: string;
};

const emptyForm: FormState = {
  ownerSecret: '', agentSecrets: ['', '', '', ''],
  dailyLimit: '1000000', perTransactionLimit: '100000',
};

function hexBytes(value: string, label: string): Uint8Array {
  const normalized = value.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) throw new Error(`${label} must be exactly 32 bytes of hexadecimal.`);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function serialize(bytes: Uint8Array): string {
  let result = '';
  for (const byte of bytes) result += byte.toString(16).padStart(2, '0');
  return result;
}

function deserializeFinalized(value: string) {
  const bytes = new Uint8Array(value.match(/.{1,2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []);
  return Transaction.deserialize('signature', 'proof', 'binding', bytes);
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : JSON.stringify(error);
}

function connectorCandidates(): Connector[] {
  const runtime = globalThis as typeof globalThis & { midnight?: Record<string, InitialAPI> | InitialAPI };
  const value = runtime.midnight;
  if (!value) return [];
  const entries = Array.isArray(value) ? value.map((item, index) => [`wallet-${index}`, item] as const) :
    typeof value === 'object' && value !== null && !('connect' in value)
      ? Object.entries(value)
      : [['default', value] as const];
  return entries.flatMap(([key, provider]) => provider && typeof provider.connect === 'function'
    ? [{ name: provider.name || key, rdns: provider.rdns, provider }]
    : []);
}

async function buildPrivateState(form: FormState): Promise<VouchPrivateState> {
  return createVouchPrivateState({
    dailyLimit: BigInt(form.dailyLimit),
    perTransactionLimit: BigInt(form.perTransactionLimit),
    spentToday: 0n,
    ownerSecret: hexBytes(form.ownerSecret, 'Owner secret'),
    agentSecrets: form.agentSecrets.map((secret, index) => hexBytes(secret, `Agent ${index} secret`)) as unknown as VouchPrivateState['agentSecrets'],
  });
}

async function deployThroughConnector(api: ConnectedAPI, privateState: VouchPrivateState) {
  const config = await api.getConfiguration();
  if (config.networkId !== NETWORK) throw new Error(`Wallet is connected to ${config.networkId}, not ${NETWORK}.`);
  const addresses = await api.getShieldedAddresses();
  const provingProvider = await api.getProvingProvider(ZK);
  const walletProvider = {
    getCoinPublicKey: () => { throw new Error('The connector did not expose a coin public key.'); },
    getEncryptionPublicKey: () => { throw new Error('The connector did not expose an encryption public key.'); },
    async balanceTx(tx: { serialize: () => Uint8Array }) {
      const balanced = await api.balanceUnsealedTransaction(serialize(tx.serialize()));
      return deserializeFinalized(balanced.tx);
    },
  };
  const midnightProvider = {
    async submitTx(tx: { serialize: () => Uint8Array; identifiers: () => unknown[] }) {
      const ids = tx.identifiers();
      const id = ids[0] ? String(ids[0]) : '';
      await api.submitTransaction(serialize(tx.serialize()));
      return id;
    },
  };
  const providers = {
    privateStateProvider: {
      async getPrivateState() { return undefined; },
      async setPrivateState() {},
      async removePrivateState() {},
    },
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    zkConfigProvider: ZK,
    proofProvider: createProofProvider(provingProvider),
    walletProvider,
    midnightProvider,
  };
  const deployed = await deployContract(providers as never, {
    compiledContract: compiledVouchPolicy,
    privateStateId: 'vouchPolicyPrivateState',
    initialPrivateState: privateState,
  } as never);
  const publicData = (deployed as { deployTxData: { public: { txId: string; contractAddress?: string } } }).deployTxData.public;
  if (!publicData.contractAddress) throw new Error('Deployment was submitted but no contract address was returned by Midnight.js.');
  return { address: publicData.contractAddress, txId: publicData.txId, addresses };
}

export function DeploymentPage() {
  const [connectors, setConnectors] = useState<Connector[]>(() => connectorCandidates());
  const [api, setApi] = useState<ConnectedAPI | null>(null);
  const [wallet, setWallet] = useState('Not connected');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<{ address: string; txId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const oneAm = useMemo(() => connectors.find((item) => /1am/i.test(`${item.name} ${item.rdns}`)), [connectors]);

  const connect = async () => {
    setMessage('');
    try {
      const found = oneAm ?? connectors[0];
      if (!found) throw new Error('No Midnight DApp Connector detected. Open this page in Chrome with 1AM enabled.');
      const connected = await found.provider.connect(NETWORK);
      const status = await connected.getConnectionStatus();
      if (status.status !== 'connected' || status.networkId !== NETWORK) {
        throw new Error(`Connected network is ${status.status === 'connected' ? status.networkId : 'disconnected'}, not ${NETWORK}.`);
      }
      const addresses = await connected.getShieldedAddresses();
      setApi(connected);
      setWallet(addresses.shieldedAddress);
      setMessage(`Connected to ${found.name}. Network: Preprod.`);
    } catch (error) {
      setMessage(`Connection failed: ${readableError(error)}`);
    }
  };

  const deploy = async () => {
    if (!api) return setMessage('Connect 1AM before deploying.');
    setBusy(true); setMessage('Creating, proving, balancing, and submitting the real Preprod deployment...');
    try {
      const deployed = await deployThroughConnector(api, await buildPrivateState(form));
      setResult({ address: deployed.address, txId: deployed.txId });
      setMessage('Deployment transaction submitted. The returned deployment identifier is shown below.');
    } catch (error) {
      setMessage(`Deployment failed: ${readableError(error)}`);
    } finally { setBusy(false); }
  };

  return <main className="deployment-page">
    <h1>Vouch Preprod Deployment</h1>
    <p>Network: <strong>Midnight Preprod</strong></p>
    <button onClick={() => { setConnectors(connectorCandidates()); void connect(); }} disabled={busy}>Connect 1AM</button>
    <p>Wallet: <strong>{wallet}</strong></p>
    {message && <pre role="status">{message}</pre>}
    <details>
      <summary>Deployment policy state (kept in this browser tab only)</summary>
      <p>Enter the same policy secrets and raw policy values configured for Vouch. Recipient and category commitments are derived with the same SHA-256 and trim rules as the backend.</p>
      <label>ownerSecret<input type="password" value={form.ownerSecret} onChange={(event) => setForm({ ...form, ownerSecret: event.target.value })} /></label>
      {form.agentSecrets.map((secret, index) => <label key={index}>agentSecret_{index}<input type="password" value={secret} onChange={(event) => setForm({ ...form, agentSecrets: form.agentSecrets.map((item, itemIndex) => itemIndex === index ? event.target.value : item) as FormState['agentSecrets'] })} /></label>)}
      <label>dailyLimit<input value={form.dailyLimit} onChange={(event) => setForm({ ...form, dailyLimit: event.target.value })} /></label>
      <label>perTransactionLimit<input value={form.perTransactionLimit} onChange={(event) => setForm({ ...form, perTransactionLimit: event.target.value })} /></label>
    </details>
    <button onClick={() => void deploy()} disabled={!api || busy}>{busy ? 'Deploying…' : 'Deploy Vouch Contract'}</button>
    {result && <section><h2>Deployment successful</h2><p>Contract: <code>{result.address}</code></p><p>Transaction: <code>{result.txId}</code></p></section>}
  </main>;
}
