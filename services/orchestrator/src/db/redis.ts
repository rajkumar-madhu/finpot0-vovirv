import { createClient } from 'redis';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | null = null;

export const getRedisClient = async (): Promise<RedisClient> => {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  redisClient = createClient({ url: config.redisUrl });

  redisClient.on('error', (err) => logger.error({ err }, 'Redis client error'));
  redisClient.on('reconnecting', () => logger.warn('Redis reconnecting'));

  await redisClient.connect();
  logger.info('Orchestrator connected to Redis');
  return redisClient;
};

export const closeRedis = async (): Promise<void> => {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
  }
};
