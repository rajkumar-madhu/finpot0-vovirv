import { createClient, RedisClientType } from 'redis';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let redisClient: RedisClientType | null = null;

export const getRedisClient = async (): Promise<RedisClientType> => {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  redisClient = createClient({
    url: config.redisUrl,
  });

  redisClient.on('error', (err) => {
    logger.error({ err }, 'Redis client error');
  });

  redisClient.on('connect', () => {
    logger.info('Connected to Redis');
  });

  redisClient.on('reconnecting', () => {
    logger.warn('Reconnecting to Redis');
  });

  await redisClient.connect();
  return redisClient;
};

export const checkRedisConnection = async (): Promise<boolean> => {
  try {
    const client = await getRedisClient();
    await client.ping();
    return true;
  } catch {
    return false;
  }
};

export const closeRedis = async (): Promise<void> => {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
};

// Rate limiting helpers
export const incrementRateLimit = async (
  key: string,
  windowSeconds: number
): Promise<number> => {
  const client = await getRedisClient();
  const multi = client.multi();

  multi.incr(key);
  multi.expire(key, windowSeconds);

  const results = await multi.exec();
  return (results?.[0] as number) || 0;
};

export const getRateLimitCount = async (key: string): Promise<number> => {
  const client = await getRedisClient();
  const count = await client.get(key);
  return count ? parseInt(count, 10) : 0;
};

// Session helpers
export const setSession = async (
  sessionId: string,
  data: Record<string, unknown>,
  expiresInSeconds: number
): Promise<void> => {
  const client = await getRedisClient();
  await client.setEx(
    `session:${sessionId}`,
    expiresInSeconds,
    JSON.stringify(data)
  );
};

export const getSession = async (
  sessionId: string
): Promise<Record<string, unknown> | null> => {
  const client = await getRedisClient();
  const data = await client.get(`session:${sessionId}`);
  return data ? JSON.parse(data) : null;
};

export const deleteSession = async (sessionId: string): Promise<void> => {
  const client = await getRedisClient();
  await client.del(`session:${sessionId}`);
};

// Token blacklist (for logout)
export const blacklistToken = async (
  token: string,
  expiresInSeconds: number
): Promise<void> => {
  const client = await getRedisClient();
  await client.setEx(`blacklist:${token}`, expiresInSeconds, '1');
};

export const isTokenBlacklisted = async (token: string): Promise<boolean> => {
  const client = await getRedisClient();
  const exists = await client.exists(`blacklist:${token}`);
  return exists === 1;
};
