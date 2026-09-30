import type { NetworkConfig, NetworkId } from '../network.js';
import type { WalletContext } from '../wallet.js';
import type { AuthorizationService } from '../authorization/index.js';
import { createVouchExecutionService as createService } from './service.js';
export { createLocalVouchSecrets, loadVouchPrivateState } from './config.js';
export {
  commitmentForSecret,
  commitmentForPolicyValue,
  createVouchCallTxProviders,
  createVouchProviders,
  VOUCH_PRIVATE_STATE_ID,
} from './midnight.js';
export { createVouchExecutionService, VouchExecutionService } from './service.js';
export {
  VouchExecutionError,
  type SuccessfulVouchExecution,
  type VouchBrowserWalletKeys,
  type VouchExecutionErrorCode,
  type VouchExecutionRequest,
  type VouchPendingTransaction,
} from './types.js';

/**
 * Convenience constructor preserving the previous four-argument call
 * signature for callers that hold a wallet context (scripts, demos).
 */
export function createVouchExecutionServiceWithWallet(
  authorization: Pick<AuthorizationService, 'authorize'>,
  network: NetworkId,
  networkConfig: NetworkConfig,
  wallet: WalletContext,
) {
  return createService(authorization, network, networkConfig, wallet);
}
