import { CallTxFailedError, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { AuthorizationService } from '../authorization/index.js';
import type { SpendAgentIntent } from '../agent-runtime/types.js';
import type { NetworkConfig, NetworkId } from '../network.js';
import { getDeployment } from '../network.js';
import { createWallet, type WalletContext } from '../wallet.js';
import { loadVouchPrivateState } from './config.js';
import {
  assertPrivateStateShape,
  commitmentForPolicyValue,
  commitmentForSecret,
  createVouchProviders,
  VOUCH_PRIVATE_STATE_ID,
} from './midnight.js';
import { compiledVouchPolicy } from '../vouch-policy.js';
import {
  VouchExecutionError,
  type SuccessfulVouchExecution,
  type VouchExecutionRequest,
} from './types.js';

export class VouchExecutionService {
  constructor(
    private readonly authorization: Pick<AuthorizationService, 'authorize'>,
    private readonly network: NetworkId,
    private readonly networkConfig: NetworkConfig,
    private readonly wallet: WalletContext,
  ) {}

  async authorizeSpend(
    request: VouchExecutionRequest,
    authorization: Pick<AuthorizationService, 'authorize'> = this.authorization,
  ): Promise<SuccessfulVouchExecution> {
    const decision = authorization.authorize({ intent: request.intent });
    if (decision.decision !== 'allowed') {
      throw new VouchExecutionError('pre-validation-rejected', decision.reason);
    }
    if (request.intent.action !== 'spend') {
      throw new VouchExecutionError('execution-failed', 'Only spend intents can be executed by this service.');
    }
    const recipientCommitment = commitmentForPolicyValue(request.intent.recipient.trim());
    const categoryCommitment = commitmentForPolicyValue(request.intent.category.trim());

    const deployment = getDeployment(this.network);
    if (!deployment) {
      throw new VouchExecutionError('contract-not-deployed', `No Vouch contract deployment is recorded for ${this.network}.`);
    }

    const privateState = loadVouchPrivateState();
    assertPrivateStateShape(privateState);
    const providers = createVouchProviders(this.wallet, this.network, this.networkConfig);

    let deployed: Awaited<ReturnType<typeof findDeployedContract>>;
    try {
      // See the provider typing note in deploy.ts: Midnight.js 4.1.x exposes
      // verifier IDs as string while generated circuits use literal names.
      deployed = await findDeployedContract(providers as any, {
        compiledContract: compiledVouchPolicy,
        contractAddress: deployment.address,
        privateStateId: VOUCH_PRIVATE_STATE_ID,
        initialPrivateState: privateState,
      });
    } catch (error) {
      throw new VouchExecutionError('contract-lookup-failed', 'Unable to load the deployed Vouch contract.', { cause: error });
    }

    try {
      await deployed.callTx.authorizeAgent(commitmentForSecret(privateState.agentSecret));
    } catch (error) {
      throw classifyCircuitError(error, 'Midnight rejected agent authorization.');
    }

    try {
      const finalized = await deployed.callTx.requestSpend(
        request.intent.amount,
        recipientCommitment,
        categoryCommitment,
      );
      return {
        status: 'confirmed',
        contractAddress: deployment.address,
        transactionId: finalized.public.txId,
        intent: request.intent,
      };
    } catch (error) {
      throw classifyCircuitError(error, 'Midnight rejected the Vouch authorization request.');
    }
  }
}

function classifyCircuitError(error: unknown, rejectedMessage: string): VouchExecutionError {
  if (error instanceof CallTxFailedError) {
    return new VouchExecutionError('transaction-rejected', rejectedMessage, { cause: error });
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('proof') || message.includes('prover')) {
    return new VouchExecutionError('proof-generation-failed', 'Midnight proof generation failed.', { cause: error });
  }
  if (message.includes('submit') || message.includes('relay') || message.includes('node')) {
    return new VouchExecutionError('transaction-submission-failed', 'Midnight transaction submission failed.', { cause: error });
  }
  return new VouchExecutionError('execution-failed', 'Vouch authorization execution failed.', { cause: error });
}

export async function createVouchExecutionService(
  authorization: Pick<AuthorizationService, 'authorize'>,
  network: NetworkId,
  networkConfig: NetworkConfig,
  wallet: WalletContext,
): Promise<VouchExecutionService> {
  return new VouchExecutionService(authorization, network, networkConfig, wallet);
}
