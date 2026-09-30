import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { ApiError } from './errors.js';
import { resolveNetwork, getDeployment } from '../network.js';
import { createVouchExecutionService, type VouchExecutionAdapter } from '../execution/service.js';
import { AuthorizationService } from '../authorization/service.js';

type ExecutionState = {
  status: 'syncing' | 'ready' | 'unavailable';
  error?: string;
  execution?: VouchExecutionAdapter;
};

async function main() {
  let config;
  let networkInfo: { network: ReturnType<typeof resolveNetwork>['network']; deployment: ReturnType<typeof getDeployment> };
  let resolved: ReturnType<typeof resolveNetwork>;

  try {
    config = loadConfig(process.env);
    resolved = resolveNetwork({ env: process.env });
    if (resolved.network !== 'preprod') {
      throw new Error(`Vouch requires Midnight Preprod; resolved ${resolved.network}. Set VOUCH_NETWORK=preprod.`);
    }
    const deployment = getDeployment(resolved.network);
    if (!deployment) {
      throw new Error('No Vouch Preprod deployment is recorded in .midnight-state.json.');
    }
    networkInfo = { network: resolved.network, deployment };
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // The browser-wallet transaction split requires no backend execution wallet:
  // transactions are built and proved server-side from server-held secrets and
  // balanced/signed/submitted by the user's connected DApp-connector wallet.
  const executionState: ExecutionState = { status: 'ready' };
  const { fastify } = createApp({ networkInfo, executionState });

  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send(error.toBody());
      return;
    }
    reply.status(500).send({
      error: { code: 'internal-error', message: 'Internal server error' },
    });
  });

  try {
    await fastify.listen({ host: config.host, port: config.port });
  } catch (error) {
    console.error('Failed to start server:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log(`vouch-api listening at http://${config.host}:${config.port}`);
  console.log('Midnight transactions are built and proved server-side; the connected user wallet balances, signs, and submits them.');

  void (async () => {
    try {
      const trustedRoutePrevalidation = new AuthorizationService({
        getAgent: () => undefined,
      });

      const execution = await createVouchExecutionService(
        trustedRoutePrevalidation,
        networkInfo.network,
        resolved.config,
      );

      executionState.execution = execution;
      console.log('Midnight browser-wallet transaction service ready.');
    } catch (error) {
      executionState.status = 'unavailable';
      executionState.error = error instanceof Error ? error.message : String(error);
      console.error('Midnight execution is unavailable:', executionState.error);
    }
  })();
}

main();
