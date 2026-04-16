/**
 * meeting-worker entrypoint.
 *
 * Boots a Fastify HTTP server on PORT (default 3100), opens the shared
 * SQLite connection, exposes a minimal /health endpoint, and installs
 * SIGTERM/SIGINT handlers so the container exits cleanly when docker
 * compose stops the stack.
 *
 * LiveKit webhook and recording-control routes are registered in Phase 4;
 * this file only provides the bootstrap + lifecycle scaffolding.
 */
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { config } from './config.js';
import { getDb, closeDb } from './db.js';
import { webhooksPlugin } from './webhooks.js';
import { recordingsRoutesPlugin } from './routes.js';

async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: config.isProduction ? 'info' : 'debug',
      // Pretty-print in development, JSON in production — matches Next.js
      // convention and keeps docker logs greppable.
      ...(config.isProduction
        ? {}
        : { transport: { target: 'pino-pretty', options: { singleLine: true } } }),
    },
    disableRequestLogging: false,
    trustProxy: true,
  });

  // Lightweight liveness probe used by docker compose healthcheck.
  server.get('/health', async () => ({
    status: 'ok',
    service: 'meeting-worker',
    version: '0.1.0',
    uptime: process.uptime(),
  }));

  // Close the SQLite handle when fastify tears down (onClose fires for both
  // graceful shutdown and test teardown).
  server.addHook('onClose', async () => {
    closeDb();
  });

  // Phase 4 routes: LiveKit webhook receiver + recording control endpoints.
  await server.register(webhooksPlugin);
  await server.register(recordingsRoutesPlugin);

  return server;
}

async function main(): Promise<void> {
  // Pre-open the DB so a misconfigured path / missing file fails fast,
  // before we start accepting requests.
  try {
    getDb();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[meeting-server] Failed to open SQLite database:', err);
    process.exit(1);
  }

  const server = await buildServer();

  // Graceful shutdown. Fastify's close() drains connections, fires
  // preClose/onClose hooks, then resolves.
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    server.log.info({ signal }, 'received shutdown signal, closing server');
    try {
      await server.close();
      server.log.info('server closed cleanly');
      process.exit(0);
    } catch (err) {
      server.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Last-chance diagnostic for unhandled errors; crash-loop is preferable
  // to a half-alive worker because the orchestrator (docker) will restart us.
  process.on('unhandledRejection', (reason) => {
    server.log.fatal({ reason }, 'unhandled promise rejection — exiting');
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    server.log.fatal({ err }, 'uncaught exception — exiting');
    process.exit(1);
  });

  try {
    const address = await server.listen({ host: '0.0.0.0', port: config.port });
    server.log.info({ address }, 'meeting-worker listening');
  } catch (err) {
    server.log.error({ err }, 'failed to bind port');
    process.exit(1);
  }
}

void main();
