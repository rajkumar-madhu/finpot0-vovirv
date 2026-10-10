import { config } from './config.js';
import { logger } from './utils/logger.js';
import { startWorker, stopWorker } from './services/queue.js';

async function main() {
  logger.info({
    env: config.nodeEnv,
    redisUrl: config.redisUrl,
  }, 'ingestion_worker_booting');

  startWorker();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await stopWorker();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info('ingestion_worker_ready');
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start ingestion worker');
  process.exit(1);
});
