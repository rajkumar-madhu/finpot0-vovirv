import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
  port: z.coerce.number().default(4002),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  redisUrl: z.string().url(),

  sttUrl: z.string().url().default('http://localhost:8001'),
  ttsUrl: z.string().url().default('http://localhost:8002'),
  ragUrl: z.string().url().default('http://localhost:8003'),
  authUrl: z.string().url().default('http://localhost:4001'),

  flowiseUrl: z.string().url().default('http://localhost:3000'),
  flowiseApiKey: z.string().default(''),

  maxAudioSizeMb: z.coerce.number().default(50),
  tempAudioDir: z.string().default('/tmp/orchestrator-audio'),

  sessionTtlSeconds: z.coerce.number().default(1800),  // 30 minutes
  maxHistoryTurns: z.coerce.number().default(10),       // 10 exchanges = 20 messages

  internalServiceKey: z.string().optional(),
});

const parseConfig = () => {
  const result = ConfigSchema.safeParse({
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    redisUrl: process.env.REDIS_URL,
    sttUrl: process.env.STT_URL,
    ttsUrl: process.env.TTS_URL,
    ragUrl: process.env.RAG_URL,
    authUrl: process.env.AUTH_URL,
    flowiseUrl: process.env.FLOWISE_URL,
    flowiseApiKey: process.env.FLOWISE_API_KEY,
    maxAudioSizeMb: process.env.MAX_AUDIO_SIZE_MB,
    tempAudioDir: process.env.TEMP_AUDIO_DIR,
    sessionTtlSeconds: process.env.SESSION_TTL_SECONDS,
    maxHistoryTurns: process.env.MAX_HISTORY_TURNS,
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
