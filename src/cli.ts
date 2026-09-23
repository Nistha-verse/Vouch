/**
 * Operator CLI for the deployed Vouch authorization contract.
 *
 * This CLI submits real Midnight transactions. It never prints wallet seeds,
 * private-state passwords, or private witness values.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { WebSocket } from 'ws';
import { CallTxFailedError, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { resolveNetwork, getDeployment, getOrCreateWallet, formatWalletBackupNotice } from './network.js';
import { createWallet, persistWalletState, unshieldedToken, type WalletContext } from './wallet.js';
import { compiledVouchPolicy } from './vouch-policy.js';
import {
  assertPrivateStateShape,
  commitmentForPolicyValue,
  commitmentForSecret,
  createVouchProviders,
  VOUCH_PRIVATE_STATE_ID,
} from './execution/midnight.js';
import { loadVouchPrivateState } from './execution/config.js';
import { canonicalCategory, canonicalRecipient } from './authorization/canonical.js';

// @ts-expect-error Required for wallet sync.
globalThis.WebSocket = WebSocket;

const { network, config: networkConfig } = resolveNetwork();
const deployment = getDeployment(network);
const walletRecord = getOrCreateWallet(network);

function parseAmount(value: string): bigint {
  const trimmed = value.trim();
  if (!/^[1-9][0-9]*$/.test(trimmed)) {
    throw new Error('Amount must be a positive whole-number decimal string.');
  }
  return BigInt(trimmed);
}

function errorMessage(error: unknown): string {
  if (error instanceof CallTxFailedError) {
    return 'Midnight rejected the transaction, likely because the agent or policy check failed.';
  }
  if (error instanceof Error) return error.message;
  return 'The Midnight transaction failed.';
}

async function showBalance(walletCtx: WalletContext): Promise<void> {
  const state = await walletCtx.wallet.waitForSyncedState();
  const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  const dust = state.dust.balance(new Date());
  console.log(`\n  tNIGHT: ${balance.toLocaleString()}`);
  console.log(`  DUST:   ${dust.toLocaleString()}\n`);
}

async function authorizeAgent(
  deployed: Awaited<ReturnType<typeof findDeployedContract>>,
  agentSecret: Uint8Array,
): Promise<void> {
  console.log('\n  Authorizing the configured agent through Midnight...');
  try {
    const finalized = await deployed.callTx.authorizeAgent(commitmentForSecret(agentSecret));
    console.log('  ✓ Agent authorization confirmed by Midnight.');
    console.log(`  Transaction ID: ${finalized.public.txId}\n`);
  } catch (error) {
    console.error(`  ✗ Agent authorization failed: ${errorMessage(error)}\n`);
  }
}

async function requestSpend(
  rl: ReturnType<typeof createInterface>,
  deployed: Awaited<ReturnType<typeof findDeployedContract>>,
): Promise<void> {
  try {
    const amount = parseAmount(await rl.question('  Amount (whole tNIGHT units): '));
    const recipient = canonicalRecipient(await rl.question('  Recipient: '));
    const category = canonicalCategory(await rl.question('  Category: '));

    console.log('\n  Submitting spend authorization to Midnight...');
    console.log('  Midnight will perform the final authorization and policy checks.');
    const finalized = await deployed.callTx.requestSpend(
      amount,
      commitmentForPolicyValue(recipient),
      commitmentForPolicyValue(category),
    );
    console.log('  ✓ Spend authorization confirmed by Midnight.');
    console.log(`  Transaction ID: ${finalized.public.txId}\n`);
  } catch (error) {
    console.error(`  ✗ Spend authorization failed: ${errorMessage(error)}\n`);
  }
}

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  let walletCtx: WalletContext | undefined;

  try {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                         Vouch CLI                            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    if (!deployment) {
      throw new Error(`No Vouch deployment is recorded for ${network}. Configure the deployed contract first.`);
    }

    const notice = formatWalletBackupNotice(walletRecord, network);
    if (notice) console.log(notice);
    console.log(`  Network:  ${network}`);
    console.log(`  Contract: ${deployment.address}\n`);

    console.log('  Connecting to wallet and syncing with the network...');
    walletCtx = await createWallet({ network, networkConfig, seed: walletRecord.seed });
    const syncStart = Date.now();
    const syncInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - syncStart) / 1000);
      process.stdout.write(`\r  ⏳ Syncing... (${elapsed}s elapsed)   `);
    }, 5000);
    const state = await walletCtx.wallet.waitForSyncedState();
    clearInterval(syncInterval);
    process.stdout.write('\r  ✓ Wallet synced.                                      \n');
    await persistWalletState(network, walletCtx);

    const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
    console.log(`  Wallet balance: ${balance.toLocaleString()} tNIGHT\n`);

    const privateState = loadVouchPrivateState();
    assertPrivateStateShape(privateState);
    const providers = createVouchProviders(walletCtx, network, networkConfig);
    const deployed = await findDeployedContract(providers as any, {
      compiledContract: compiledVouchPolicy,
      contractAddress: deployment.address,
      privateStateId: VOUCH_PRIVATE_STATE_ID,
      initialPrivateState: privateState,
    });
    console.log('  ✓ Connected to the deployed Vouch contract.\n');

    let running = true;
    while (running) {
      console.log('─── Actions ───────────────────────────────────────────────────');
      console.log('  1. Show wallet balance');
      console.log('  2. Authorize configured agent');
      console.log('  3. Request spend authorization');
      console.log('  4. Exit\n');

      switch ((await rl.question('  Choose an action: ')).trim()) {
        case '1':
          try {
            await showBalance(walletCtx);
          } catch (error) {
            console.error(`  ✗ Could not read wallet balance: ${errorMessage(error)}\n`);
          }
          break;
        case '2':
          await authorizeAgent(deployed, privateState.agentSecret);
          break;
        case '3':
          await requestSpend(rl, deployed);
          break;
        case '4':
          running = false;
          console.log('\n  Goodbye.\n');
          break;
        default:
          console.log('\n  Invalid action. Choose 1-4.\n');
      }
    }
  } catch (error) {
    console.error(`\n  ✗ ${errorMessage(error)}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
    if (walletCtx) {
      try {
        await persistWalletState(network, walletCtx);
      } catch (error) {
        console.error(`  ⚠ Could not persist wallet sync state: ${errorMessage(error)}`);
      }
      try {
        await walletCtx.wallet.stop();
      } catch {
        // Wallet may already be stopped after a failed connection.
      }
    }
  }
}

void main();
