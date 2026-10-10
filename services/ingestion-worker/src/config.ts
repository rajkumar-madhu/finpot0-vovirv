import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  redisUrl: z.string().url(),

  ragUrl: z.string().url().default('http://localhost:8003'),

  ingestionQueueName: z.string().default('document-ingestion'),
  ingestionConcurrency: z.coerce.number().default(3),
});

const parseConfig = () => {
  const result = ConfigSchema.safeParse({
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    redisUrl: process.env.REDIS_URL,
    ragUrl: process.env.RAG_URL,
    ingestionQueueName: process.env.INGESTION_QUEUE_NAME,
    ingestionConcurrency: process.env.INGESTION_CONCURRENCY,
  });

  if (!result.success) {
    console.error('Invalid configuration:', result.error.format());
    process.exit(1);
  }

  return result.data;
};

export const config = parseConfig();
export type Config = z.infer<typeof ConfigSchema>;
