import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
  port: z.coerce.number().default(4000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Redis
  redisUrl: z.string().url(),

  // JWT
  jwtSecret: z.string().min(32),

  // Downstream services
  authServiceUrl: z.string().url(),
  sttServiceUrl: z.string().url(),
  ttsServiceUrl: z.string().url(),
  ragServiceUrl: z.string().url(),
  flowiseUrl: z.string().url(),
  orchestratorUrl: z.string().url(),

  // Rate limiting
  rateLimitWindowMs: z.coerce.number().default(60000),
  rateLimitMaxRequests: z.coerce.number().default(100),

  // CORS
  allowedOrigins: z.string().default(''),

  // Logging
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Twilio
  twilioAccountSid: z.string().optional(),
  twilioAuthToken: z.string().optional(),
  twilioPhoneNumber: z.string().optional(),
  twilioDefaultTenantId: z.string().default('default-tenant'),
});

const parseConfig = () => {
  const result = ConfigSchema.safeParse({
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    redisUrl: process.env.REDIS_URL,
    jwtSecret: process.env.JWT_SECRET,
    authServiceUrl: process.env.AUTH_SERVICE_URL,
    sttServiceUrl: process.env.STT_SERVICE_URL,
    ttsServiceUrl: process.env.TTS_SERVICE_URL,
    ragServiceUrl: process.env.RAG_SERVICE_URL,
    flowiseUrl: process.env.FLOWISE_URL,
    orchestratorUrl: process.env.ORCHESTRATOR_URL,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,
    allowedOrigins: process.env.ALLOWED_ORIGINS,
    logLevel: process.env.LOG_LEVEL,
    // Twilio
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
    twilioDefaultTenantId: process.env.TWILIO_DEFAULT_TENANT_ID,
  });

  if (!result.success) {
    console.error('Invalid configuration:', result.error.format());
    process.exit(1);
  }

  return result.data;
};

export const config = parseConfig();

// Service URLs map
export const SERVICES = {
  auth: config.authServiceUrl,
  stt: config.sttServiceUrl,
  tts: config.ttsServiceUrl,
  rag: config.ragServiceUrl,
  flowise: config.flowiseUrl,
  orchestrator: config.orchestratorUrl,
} as const;

export type ServiceName = keyof typeof SERVICES;
