import { resolveNetwork, getOrCreateWallet } from '../src/network.js';
import { createWallet, waitForWalletSync, persistWalletState } from '../src/wallet.js';

async function main() {
  const resolved = resolveNetwork({ env: process.env });
  console.log('Network resolved:', resolved.network);
  const credentials = getOrCreateWallet(resolved.network);
  console.log('Seed retrieved. Creating wallet facade...');
  const wallet = await createWallet({
    network: resolved.network,
    networkConfig: resolved.config,
    seed: credentials.seed,
  });
  console.log('Wallet facade created. Restored:', wallet.restored);
  console.log('Starting sync with 10m timeout...');
  try {
    await waitForWalletSync(wallet.wallet, {
      diagnosticIntervalMs: 10000,
      inactivityTimeoutMs: 120000,
      maxDurationMs: 600000,
      onDiagnostic: (msg) => console.log('Diagnostic:', msg),
    });
    console.log('Wallet synchronized successfully!');
    await persistWalletState(resolved.network, wallet);
    console.log('Wallet state persisted successfully to disk.');
    process.exit(0);
  } catch (err) {
    console.error('Sync failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main().catch(console.error);
