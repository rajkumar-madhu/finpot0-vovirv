import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
  port: z.coerce.number().default(4001),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  databaseUrl: z.string().url(),

  // Redis
  redisUrl: z.string().url(),

  // JWT
  jwtSecret: z.string().min(32),
  jwtExpiresIn: z.string().default('7d'),
  jwtRefreshExpiresIn: z.string().default('30d'),

  // API Key
  apiKeyHashRounds: z.coerce.number().default(12),

  // Rate Limiting
  rateLimitFree: z.coerce.number().default(60),
  rateLimitPro: z.coerce.number().default(300),
  rateLimitEnterprise: z.coerce.number().default(1000),

  // Logging
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Internal service-to-service auth
  internalServiceKey: z.string().optional(),
});

const parseConfig = () => {
  const result = ConfigSchema.safeParse({
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
    apiKeyHashRounds: process.env.API_KEY_HASH_ROUNDS,
    rateLimitFree: process.env.RATE_LIMIT_FREE,
    rateLimitPro: process.env.RATE_LIMIT_PRO,
    rateLimitEnterprise: process.env.RATE_LIMIT_ENTERPRISE,
    logLevel: process.env.LOG_LEVEL,
    internalServiceKey: process.env.INTERNAL_SERVICE_KEY,
  });

  if (!result.success) {
    console.error('Invalid configuration:', result.error.format());
    process.exit(1);
  }

  return result.data;
};

export const config = parseConfig();
export type Config = z.infer<typeof ConfigSchema>;
