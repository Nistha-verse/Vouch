import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { ApiError } from './errors.js';
import { resolveNetwork, getOrCreateWallet } from '../network.js';
import { createWallet } from '../wallet.js';
import { createVouchExecutionService } from '../execution/service.js';
import { AuthorizationService } from '../authorization/service.js';

async function main() {
  let config;

  try {
    config = loadConfig(process.env);
  } catch (error) {
    console.error(
      'Configuration error:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }

  let execution;
  try {
    const resolved = resolveNetwork({ env: process.env });
    const credentials = getOrCreateWallet(resolved.network);
    const wallet = await createWallet({ network: resolved.network, networkConfig: resolved.config, seed: credentials.seed });
    await wallet.wallet.waitForSyncedState();
    execution = await createVouchExecutionService(
      new AuthorizationService({ getAgent: () => undefined }),
      resolved.network,
      resolved.config,
      wallet,
    );
  } catch (error) {
    console.error('Midnight execution is unavailable:', error instanceof Error ? error.message : error);
  }
  const { fastify } = createApp({ execution });

  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send(error.toBody());
      return;
    }

    reply.status(500).send({
      error: {
        code: 'internal-error',
        message: 'Internal server error',
      },
    });
  });

  try {
    await fastify.listen({
      host: config.host,
      port: config.port,
    });
  } catch (error) {
    console.error(
      'Failed to start server:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }

  console.log(
    `vouch-api listening at http://${config.host}:${config.port}`,
  );
}

main();
