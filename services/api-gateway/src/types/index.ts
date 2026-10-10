import { z } from 'zod';

// JWT payload
export interface JwtPayload {
  sub: string;
  tenant_id: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

// Request context
export interface RequestContext {
  tenant_id: string;
  user_id?: string;
  api_key_id?: string;
  scopes?: string[];
  request_id: string;
}

// Express extensions
declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
      startTime?: number;
    }
  }
}

// Proxy target configuration
export interface ProxyTarget {
  service: string;
  url: string;
  pathRewrite?: Record<string, string>;
  requireAuth?: boolean;
  rateLimit?: {
    max: number;
    windowMs: number;
  };
}

// Health check response
export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  latency?: number;
  error?: string;
}

// Voice pipeline request
export const VoiceChatRequestSchema = z.object({
  audio: z.string().optional(), // Base64 audio
  audio_url: z.string().url().optional(),
  text: z.string().optional(),
  language: z.string().default('en'),
  persona_id: z.string().uuid().optional(),
  conversation_id: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type VoiceChatRequest = z.infer<typeof VoiceChatRequestSchema>;

// Voice pipeline response
export interface VoiceChatResponse {
  conversation_id: string;
  response_text: string;
  audio_base64?: string;
  audio_url?: string;
  detected_language: string;
  transcript?: string;
  tool_calls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result?: unknown;
  }>;
  metadata: {
    stt_latency_ms?: number;
    llm_latency_ms?: number;
    tts_latency_ms?: number;
    total_latency_ms: number;
  };
}

// Error response
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  request_id: string;
}
