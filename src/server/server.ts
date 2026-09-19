import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { ApiError } from './errors.js';

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

  const { fastify } = createApp();

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
