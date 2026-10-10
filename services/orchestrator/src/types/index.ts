export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface SttRequest {
  audioBase64: string;
  mimeType: string;
  language?: string;
  tenantId?: string;
  requestId: string;
}

export interface SttResponse {
  text: string;
  language: string;
  languageProbability: number;
  duration: number;
  segments: Array<{
    start: number;
    end: number;
    text: string;
    confidence: number;
  }>;
  processingTime: number;
}

export interface TtsRequest {
  text: string;
  voice?: string;
  speed?: number;
  language?: string;
  tenantId?: string;
  requestId: string;
}

export interface TtsResponse {
  audioBase64: string;
  mimeType: string;
  processingTime: number;
}

export interface RagRequest {
  query: string;
  tenantId: string;
  topK?: number;
  requestId: string;
}

export interface RagResponse {
  results: Array<{
    text: string;
    source: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>;
  processingTime: number;
}

export interface LlmRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  tenantId: string;
  requestId: string;
  model?: string;
}

export interface LlmResponse {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  processingTime: number;
}

export interface VoicePipelineResult {
  transcript: string;
  language: string;
  replyText: string;
  replyAudioBase64: string;
  audioMimeType: string;
  stages: {
    stt: { duration: number; status: string };
    rag?: { duration: number; status: string; resultsCount: number };
    llm: { duration: number; status: string; model: string };
    tts: { duration: number; status: string };
  };
  totalDuration: number;
  requestId: string;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      context?: {
        tenant_id?: string;
        user_id?: string;
        api_key_id?: string;
        scopes?: string[];
        request_id: string;
      };
      startTime?: number;
    }
  }
}
