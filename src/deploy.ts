/**
 * Deploy vouch contract to a Midnight network (undeployed by default; use --network preview|preprod for public networks).
 *
 * Non-interactive: scaffold → npm run setup runs straight through.
 * No readline prompts, no .midnight-seed file.
 */
import { resolveNetwork, getOrCreateWallet, formatWalletBackupNotice, recordDeployment } from './network';
import {
  createWallet,
  deriveWalletAddress,
  persistWalletState,
  quarantineWalletState,
  unshieldedToken,
  waitForWalletSync,
  WalletSyncStalledError,
  type WalletContext,
} from './wallet';
import { IndexerClient } from '@midnight-ntwrk/wallet-sdk';
import { QueryRunner } from '@midnight-ntwrk/wallet-sdk/indexer-client/effect';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';
import { loadVouchPrivateState } from './execution/config.js';
import { createVouchProviders, VOUCH_PRIVATE_STATE_ID } from './execution/midnight.js';
import { compiledVouchPolicy } from './vouch-policy.js';

// Midnight SDK imports
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';

// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

// Upper bound on the DUST wait. A healthy local devnet produces DUST within
// seconds of registration; anything approaching this means the node, the
// wallet's NIGHT balance, or the faucet is the real problem, and failing with
// that message beats hanging.
const DUST_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const DEPLOYMENT_INDEXER_VERIFY_TIMEOUT_MS = 2 * 60 * 1000;
const DUST_REGISTRATION_MAX_ATTEMPTS = 3;
const DUST_REGISTRATION_STATUS_CHECKS = 5;
const DUST_REGISTRATION_STATUS_CHECK_INTERVAL_MS = 3_000;

// ─── Network configuration ─────────────────────────────────────────────────────
//
// Resolved from --network flag, .midnight-state.json, or defaulting to
// 'undeployed' (local devnet). Switch networks with: npm run network <name>

const { network, config: networkConfig } = resolveNetwork();
const WALLET = getOrCreateWallet(network);
const SEED = WALLET.seed;
{
  const notice = formatWalletBackupNotice(WALLET, network);
  if (notice) console.log(notice);
}

// ─── Proof server readiness ────────────────────────────────────────────────────
//
// The proof-server image is distroless and has no shell, so it can't run a
// container-side healthcheck. Poll it from the host before we submit anything
// that needs proofs.

async function waitForProofServer(maxAttempts = 60, delayMs = 2000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fetch(networkConfig.proofServer, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return true;
    } catch (err: any) {
      const code = err?.cause?.code || err?.code || '';
      if (code !== 'ECONNREFUSED' && code !== 'UND_ERR_CONNECT_TIMEOUT' && code !== 'UND_ERR_SOCKET') {
        return true;
      }
    }
    if (attempt < maxAttempts) {
      process.stdout.write(`\r  Waiting for proof server... (${attempt}/${maxAttempts})   `);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

async function runWithProgress<T>(
  label: string,
  action: () => Promise<T>,
  progressMessage?: () => string,
): Promise<T> {
  const startedAt = Date.now();
  const progress = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(`  ${progressMessage?.() ?? `${label} is still in progress (${elapsedSeconds}s elapsed)...`}`);
  }, 10_000);
  try {
    return await action();
  } catch (error) {
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed after ${elapsedSeconds}s: ${message}`, { cause: error });
  } finally {
    clearInterval(progress);
  }
}

function errorMessages(error: unknown, depth = 0): string[] {
  if (depth > 5 || !(error instanceof Error)) return [String(error)];
  return [error.message, ...(error.cause === undefined ? [] : errorMessages(error.cause, depth + 1))];
}

function isTransientRpcDisconnect(error: unknown): boolean {
  return /websocket|web socket|socket|disconnect|connection (?:was )?closed|closed connection|1000.*normal closure|econnreset|etimedout|epipe/i
    .test(errorMessages(error).join(' '));
}

async function waitForIndexedRegistration(
  transactionIdentifiers: readonly string[],
  indexerUrl: string,
): Promise<boolean> {
  const lookupId = transactionIdentifiers[0];
  if (!lookupId) throw new Error('Finalized DUST registration has no transaction identifier.');

  for (let check = 1; check <= DUST_REGISTRATION_STATUS_CHECKS; check++) {
    let status;
    try {
      status = await QueryRunner.runPromise(
        IndexerClient.TransactionStatus,
        { transactionId: lookupId },
        { url: indexerUrl },
      );
    } catch (error) {
      throw new Error(
        `Could not check Preprod indexer status for DUST registration ${lookupId}; refusing to resubmit while acceptance is uncertain: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    const indexedTransaction = status.transactions.find(
      (transaction) =>
        transaction.__typename === 'RegularTransaction' &&
        transactionIdentifiers.every((id) => transaction.identifiers.includes(id)),
    );
    if (indexedTransaction?.__typename === 'RegularTransaction') {
      if (indexedTransaction.transactionResult.status !== 'SUCCESS') {
        throw new Error(
          `DUST registration ${lookupId} is indexed with status ${indexedTransaction.transactionResult.status}.`,
        );
      }
      return true;
    }

    if (check < DUST_REGISTRATION_STATUS_CHECKS) {
      await new Promise((resolve) => setTimeout(resolve, DUST_REGISTRATION_STATUS_CHECK_INTERVAL_MS));
    }
  }
  return false;
}

async function submitDustRegistration(
  wallet: WalletContext['wallet'],
  finalized: Parameters<WalletContext['wallet']['submitTransaction']>[0],
  indexerUrl: string,
): Promise<string> {
  const transactionIdentifiers = finalized.identifiers();
  const transactionId = transactionIdentifiers.at(-1);
  if (!transactionId || transactionIdentifiers.length === 0) {
    throw new Error('Finalized DUST registration has no transaction identifier.');
  }

  for (let attempt = 1; attempt <= DUST_REGISTRATION_MAX_ATTEMPTS; attempt++) {
    try {
      return await wallet.submitTransaction(finalized);
    } catch (error) {
      if (!isTransientRpcDisconnect(error)) throw error;

      console.warn(
        `  DUST registration submission lost its RPC connection (attempt ${attempt}/${DUST_REGISTRATION_MAX_ATTEMPTS}); checking the indexer before retrying...`,
      );
      if (await waitForIndexedRegistration(transactionIdentifiers, indexerUrl)) {
        console.log(`  DUST registration is already finalized on Preprod: ${transactionId}`);
        return transactionId;
      }
      if (attempt === DUST_REGISTRATION_MAX_ATTEMPTS) {
        throw new Error(
          `DUST registration ${transactionId} was not found by the Preprod indexer after ${DUST_REGISTRATION_MAX_ATTEMPTS} submission attempts.`,
          { cause: error },
        );
      }

      console.log(
        `  The Preprod indexer does not show registration ${transactionId}; retrying the same finalized transaction (${attempt + 1}/${DUST_REGISTRATION_MAX_ATTEMPTS})...`,
      );
    }
  }

  throw new Error('DUST registration submission ended without a result.');
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  Deploy vouch to ${network}`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const seed = SEED;

  console.log('─── Wallet setup ───────────────────────────────────────────────\n');
  const derivedAddress = deriveWalletAddress(seed, network);
  console.log(`  Signing address: ${derivedAddress}`);
  console.log('  Creating wallet...');
  let walletCtx = await createWallet({ network, networkConfig, seed });
  let restoredCount = Object.values(walletCtx.restored).filter(Boolean).length;
  if (restoredCount > 0) {
    console.log(`  Restored ${restoredCount}/3 child wallets from .midnight-wallet-state — sync will resume from saved point.`);
  }
    let stopping = false;
  const handleShutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;

    console.log(`\n  ${signal} received — saving wallet sync state...`);
    try {
      await persistWalletState(network, walletCtx);
      console.log('  ✓ Wallet state checkpoint saved.');
    } catch (err) {
      console.error('  ⚠ Could not save wallet state:', err);
    }

    try {
      await walletCtx.wallet.stop();
    } catch {
      // Wallet may already be stopped.
    }

    process.exit(130);
  };

  process.once('SIGINT', () => void handleShutdown('SIGINT'));
  process.once('SIGTERM', () => void handleShutdown('SIGTERM'));

  console.log('  Syncing with network...');
  console.log('  ℹ  Sync time depends on the wallet checkpoint and number of indexed ledger events.');
  console.log('     RPC disconnection messages during sync are normal and can be safely ignored.\n');
  let state: Awaited<ReturnType<typeof walletCtx.wallet.waitForSyncedState>>;
  try {
    state = await waitForWalletSync(walletCtx.wallet, {
      onDiagnostic: (message) => process.stdout.write(`\r  ⏳ ${message}   \n`),
    });
  } catch (error) {
    if (!(error instanceof WalletSyncStalledError) || restoredCount === 0 || network !== 'preprod') throw error;
    console.error(`\n  ⚠ Restored Preprod checkpoint stalled: ${error.message}`);
    console.log('  Saving the current checkpoint, then retrying once from a preserved Preprod-state backup...');
    await persistWalletState(network, walletCtx);
    await walletCtx.wallet.stop();
    const backup = quarantineWalletState(network);
    console.log(`  Preserved old Preprod wallet state at ${backup ?? 'no state directory found'}.`);
    walletCtx = await createWallet({ network, networkConfig, seed, restore: false });
    restoredCount = 0;
    state = await waitForWalletSync(walletCtx.wallet, {
      onDiagnostic: (message) => process.stdout.write(`\r  ⏳ Fresh Preprod sync: ${message}   \n`),
    });
  }
  process.stdout.write('\r  ✓ Synced with network.                                      \n');

  // Persist sync state now so a later deploy failure doesn't waste the sync work.
  await persistWalletState(network, walletCtx);

  const address = walletCtx.unshieldedKeystore.getBech32Address();
  let balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  console.log(`\n  Wallet Address: ${address}`);
  console.log(`  Balance: ${balance.toLocaleString()} tNight\n`);

  if (network === 'undeployed' && balance === 0n) {
    console.error(
      '\n❌ Genesis-seed wallet has zero NIGHT. The devnet preset may not have minted to it.\n' +
        '   Check `docker compose ps` and `docker compose logs node`. Then `docker compose down -v` and retry.\n',
    );
    await walletCtx.wallet.stop();
    process.exit(1);
  }

  // Faucet poll for public networks. The wallet has 0 tNIGHT until the user
  // funds the address from the network's faucet. The display balance is
  // authoritative here (unlike DUST, tNIGHT shows up immediately once the
  // faucet tx lands).
  if (network !== 'undeployed' && networkConfig.faucet) {
    // Same balance idiom used by check-balance.ts:
    //   state.unshielded.balances[unshieldedToken().raw] ?? 0n
    const initialBalance = await Rx.firstValueFrom(walletCtx.wallet.state().pipe(
      Rx.filter((s) => s.isSynced),
    ));
    const initialTNight = initialBalance.unshielded.balances[unshieldedToken().raw] ?? 0n;
    if (initialTNight === 0n) {
      console.log('─── Fund Wallet ────────────────────────────────────────────────\n');
      console.log(`  Wallet address: ${address}`);
      console.log(`  Faucet:         ${networkConfig.faucet}`);
      console.log('');
      console.log('  Waiting for tNIGHT to arrive (poll every 10s)...');
      const rawTimeout = Number(process.env.MIDNIGHT_FAUCET_TIMEOUT_MS);
      const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 600_000;
      const start = Date.now();
      while (true) {
        await new Promise((r) => setTimeout(r, 10_000));
        const s = await Rx.firstValueFrom(walletCtx.wallet.state().pipe(Rx.filter((x) => x.isSynced)));
        const tn = s.unshielded.balances[unshieldedToken().raw] ?? 0n;
        if (tn > 0n) {
          console.log(`\n  Funded! tNIGHT balance: ${tn.toLocaleString()}\n`);
          break;
        }
        if (Date.now() - start > timeoutMs) {
          console.log(`\n  ❌ Funding not received within ${Math.round(timeoutMs / 60_000)} min.`);
          console.log(`  Address: ${address}`);
          console.log(`  Faucet:  ${networkConfig.faucet}`);
          console.log('  Re-run setup after funding — your seed is preserved.\n');
          await walletCtx.wallet.stop();
          process.exit(1);
        }
        const elapsed = Math.round((Date.now() - start) / 1000);
        process.stdout.write(`\r  ...still waiting (${elapsed}s elapsed)`);
      }
    }
  }

  // Register for DUST.
  console.log('─── DUST Token Setup ───────────────────────────────────────────\n');
  const registrationState = await Rx.firstValueFrom(walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));

  const unregisteredUtxos = registrationState.unshielded.availableCoins.filter(
    (c: any) => !c.meta?.registeredForDustGeneration,
  );
  let submittedRegistration = false;
  if (unregisteredUtxos.length > 0) {
    console.log(`  Registering ${unregisteredUtxos.length} NIGHT UTXOs for DUST generation...`);
    // The signDustRegistration callback (3rd arg) already produces a recipe
    // with N signatures matching N inputs. Do NOT call signRecipe again — that
    // would double-sign and the chain rejects with InputsSignaturesLengthMismatch
    // (Custom error 192). Matches upstream example-counter and example-bboard.
    try {
      const recipe = await runWithProgress('Building signed DUST registration', () =>
        walletCtx.wallet.registerNightUtxosForDustGeneration(
          unregisteredUtxos,
          walletCtx.unshieldedKeystore.getPublicKey(),
          (payload) => walletCtx.unshieldedKeystore.signData(payload),
        ));
      const finalized = await runWithProgress('Finalizing DUST registration transaction', () =>
        walletCtx.wallet.finalizeRecipe(recipe));
      console.log('  Submitting DUST registration; waiting for Midnight network finalization...');
      const transactionId = await runWithProgress('Waiting for DUST registration finalization', () =>
        submitDustRegistration(walletCtx.wallet, finalized, networkConfig.indexer));
      if (!transactionId) {
        throw new Error('Registration finalized without a transaction identifier.');
      }
      submittedRegistration = true;
      console.log(`  Registration transaction finalized: ${transactionId}`);
      console.log('  Saving wallet checkpoint so an interrupted rerun resumes from the finalized transaction...');
      await persistWalletState(network, walletCtx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`NIGHT-to-DUST registration failed before completion: ${message}`, { cause: error });
    }
  }

  // Do not await facade.waitForSyncedState() here. Registration finalization
  // is already authoritative for the transaction; waiting for all historical
  // DUST events again can stall while the DUST wallet catches up. Observe only
  // the registered inputs and current projected DUST needed to continue.
  const registeredUtxos = unregisteredUtxos;
  let latestDustBalance = 0n;
  const dustStateSubscription = walletCtx.wallet.state().subscribe((walletState) => {
    latestDustBalance = walletState.dust.balance(new Date());
  });
  const dustBalanceNow = () => latestDustBalance;
  const waitForCurrentDustBalance = async () => {
    const startedAt = Date.now();
    await new Promise<void>((resolve, reject) => {
      const interval = setInterval(() => {
        const balanceNow = dustBalanceNow();
        if (balanceNow > 0n) {
          clearInterval(interval);
          resolve();
          return;
        }
        if (Date.now() - startedAt >= DUST_WAIT_TIMEOUT_MS) {
          clearInterval(interval);
          reject(new Error(`No spendable DUST balance appeared within ${Math.round(DUST_WAIT_TIMEOUT_MS / 60000)} minutes.`));
        }
      }, 1000);
    });
  };
  if (submittedRegistration && registeredUtxos.length > 0 && dustBalanceNow() === 0n) {
    console.log('  Registration is finalized; waiting up to 5 minutes for actual DUST balance...');
    const startedAt = Date.now();
    try {
      await runWithProgress(
        'Waiting for spendable DUST balance',
        waitForCurrentDustBalance,
        () => `Waiting for actual DUST balance (${Math.round((Date.now() - startedAt) / 1000)}s elapsed; balance ${dustBalanceNow().toLocaleString()})...`,
      );
    } catch (error) {
      const minutes = Math.round(DUST_WAIT_TIMEOUT_MS / 60000);
      console.error(`\n  ❌ No spendable DUST balance appeared after ${minutes} minutes: ${error instanceof Error ? error.message : String(error)}\n`);
      console.log('  DUST is generated by registered NIGHT UTXOs and pays transaction fees.');
      console.log('  Common causes:');
      console.log('    • The node is not producing blocks — check: docker compose ps');
      console.log('    • The wallet holds no NIGHT — check: npm run check-balance');
      if (network !== 'undeployed') {
        console.log(`    • The ${network} faucet has not funded this address yet`);
      }
      console.log('');
      await walletCtx.wallet.stop();
      process.exit(1);
    }
  }
  if (!submittedRegistration && dustBalanceNow() === 0n) {
    const alreadyRegisteredNights = registrationState.unshielded.availableCoins.filter(
      (coin: any) => coin.meta?.registeredForDustGeneration,
    );
    if (alreadyRegisteredNights.length === 0) {
      throw new Error('No registered or unregistered NIGHT UTXOs were available and the wallet reports no DUST balance.');
    }
    console.log(`  Found ${alreadyRegisteredNights.length} already-registered NIGHT UTXOs; waiting for actual DUST balance without restarting wallet sync...`);
    try {
      await runWithProgress('Waiting for DUST from previously registered NIGHT', waitForCurrentDustBalance);
    } catch (error) {
      const minutes = Math.round(DUST_WAIT_TIMEOUT_MS / 60000);
      throw new Error(`Previously registered NIGHT did not produce spendable DUST within ${minutes} minutes: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
  console.log('  DUST tokens ready!\n');

  // Deploy.
  console.log('─── Deploy Contract ────────────────────────────────────────────\n');

  console.log('  Checking proof server...');
  const proofServerReady = await waitForProofServer();
  if (!proofServerReady) {
    console.log('\n  ❌ Proof server not responding. Run: docker compose up -d\n');
    await walletCtx.wallet.stop();
    process.exit(1);
  }
  process.stdout.write('\r  Proof server ready!                                 \n');

  console.log('  Setting up providers...');
  const providers = createVouchProviders(walletCtx, network, networkConfig);
  const privateState = loadVouchPrivateState();

  // The wallet's reported DUST balance is a *time-projection* of what its
  // registered NIGHT will eventually generate; the tx-builder spends only
  // what the next block's timestamp accounts for, which lags wall-clock by
  // ~1 block on a fresh devnet. Sleeping ~1 block-time before attempt 1
  // closes that gap in the common case; the retry loop covers outliers.
  process.stdout.write('  Generating DUST...');
  await new Promise((r) => setTimeout(r, 6000));
  process.stdout.write(' done.\n');

  console.log('  Deploying contract...\n');

  // Fallback timing. The 6s pre-pause above handles the common case; this
  // loop covers genuine outliers (slow blocks, proof-server worker-pool
  // settling). Earlier 2s retries caused CI flakes where attempt 2's /prove
  // hit the proof-server before it had drained attempt 1's state — 5s gives
  // it room to settle between attempts. 20 × 5 = 100s total budget.
  const MAX_RETRIES = 20;
  const RETRY_DELAY_MS = 5000;
  let deployed: Awaited<ReturnType<typeof deployContract>> | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // The installed NodeZkConfigProvider exposes verifier IDs as `string`,
      // while the generated contract narrows them to circuit names. This is a
      // provider typing mismatch in Midnight.js 4.1.x; runtime APIs remain the
      // generated contract/proof-server APIs.
      deployed = await deployContract(providers as any, {
        compiledContract: compiledVouchPolicy,
        privateStateId: VOUCH_PRIVATE_STATE_ID,
        initialPrivateState: privateState,
      } as any);
      break;
    } catch (err: any) {
      const errMsg = err?.message || err?.toString() || '';
      const errCause = err?.cause?.message || err?.cause?.toString() || '';
      const fullError = `${errMsg} ${errCause}`;

      // DUST shortage is the most common transient failure on a fresh devnet —
      // check it BEFORE proof-server connectivity, because dust-balancing errors
      // can surface through proof-server-shaped messages (the wallet talks to
      // the proof-server while building the dust portion of the tx).
      const isDustShortage =
        fullError.includes('Not enough Dust') ||
        fullError.includes('Insufficient Funds') ||
        fullError.includes('could not balance dust');

      // Quiet the first DUST-shortage retry: it's the expected race between
      // wall-clock projection and block-timestamp accounting and the loud
      // `Insufficient Funds: <huge number>` message scares first-time users.
      // Real failures still get the full diagnostic from attempt 2 onward.
      if (!(isDustShortage && attempt === 1)) {
        console.error(`\n  Attempt ${attempt} error: ${errMsg}`);
        if (errCause && errCause !== errMsg) console.error(`  Cause: ${errCause}`);
      }

      if (
        !isDustShortage &&
        (fullError.includes('Failed to connect to Proof Server') ||
          fullError.includes('connect ECONNREFUSED 127.0.0.1:6300'))
      ) {
        console.log('  ❌ Proof server unreachable. Run: docker compose up -d\n');
        await walletCtx.wallet.stop();
        process.exit(1);
      }

      if (isDustShortage) {
        // Read the latest facade snapshot without waiting for every child
        // wallet to finish historical sync again. Registration was already
        // finalized; this retry only needs the current projected DUST balance.
        const currentState = await Rx.firstValueFrom(walletCtx.wallet.state());
        const dustBalance = currentState.dust.balance(new Date());
        if (attempt < MAX_RETRIES) {
          if (attempt === 1) {
            console.log(`  Still generating DUST, retrying in ${RETRY_DELAY_MS / 1000}s...`);
          } else {
            console.log(`  ⏳ DUST balance: ${dustBalance.toLocaleString()} (attempt ${attempt}/${MAX_RETRIES}); retrying in ${RETRY_DELAY_MS / 1000}s...`);
          }
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        } else {
          console.log(`  ❌ Not enough DUST after ${MAX_RETRIES} retries (current: ${dustBalance.toLocaleString()})`);
          await walletCtx.wallet.stop();
          process.exit(1);
        }
      } else {
        throw err;
      }
    }
  }

  if (!deployed) throw new Error('Deployment failed after all retries');

  const contractAddress = deployed.deployTxData.public.contractAddress;
  const deploymentTransactionId = deployed.deployTxData.public.txId;
  console.log('  ✅ Contract deployed successfully!\n');
  console.log(`  Contract Address: ${contractAddress}\n`);
  console.log(`  Deployment Transaction ID: ${deploymentTransactionId}\n`);

  const verificationStartedAt = Date.now();
  let deploymentVerification: Awaited<ReturnType<typeof findDeployedContract>> | undefined;
  let verificationError: unknown;
  while (Date.now() - verificationStartedAt < DEPLOYMENT_INDEXER_VERIFY_TIMEOUT_MS) {
    try {
      deploymentVerification = await findDeployedContract(providers as any, {
        compiledContract: compiledVouchPolicy,
        contractAddress,
        privateStateId: VOUCH_PRIVATE_STATE_ID,
        initialPrivateState: privateState,
      });
      break;
    } catch (error) {
      verificationError = error;
      const elapsed = Math.round((Date.now() - verificationStartedAt) / 1000);
      console.log(`  Waiting for Preprod indexer to expose deployment (${elapsed}s): ${error instanceof Error ? error.message : String(error)}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  if (!deploymentVerification) {
    throw new Error(
      `Deployment transaction ${deploymentTransactionId} finalized at ${contractAddress}, but Preprod indexer verification did not complete within ${DEPLOYMENT_INDEXER_VERIFY_TIMEOUT_MS / 1000}s.` +
      (verificationError instanceof Error ? ` Last error: ${verificationError.message}` : ''),
    );
  }

  recordDeployment(network, contractAddress, address.toString(), deploymentTransactionId);
  console.log('  Saved to .midnight-state.json\n');
  console.log(`  Verified contract address is queryable on ${network}.\n`);

  await persistWalletState(network, walletCtx);
  await walletCtx.wallet.stop();
  console.log('─── Deployment complete ────────────────────────────────────────\n');
  console.log('  Next: npm run cli\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
