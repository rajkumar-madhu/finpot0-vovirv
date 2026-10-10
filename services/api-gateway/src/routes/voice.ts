import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireScope } from '../middleware/auth.js';
import { proxyRequest } from '../services/proxyService.js';
import { VoiceChatRequestSchema } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { GatewayError } from '../middleware/errorHandler.js';

const router = Router();

/**
 * POST /v1/voice/chat
 * Main voice pipeline endpoint
 */
router.post(
  '/chat',
  authenticate,
  requireScope('voice', 'write'),
  async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    try {
      const data = VoiceChatRequestSchema.parse(req.body);
      const conversationId = data.conversation_id || uuidv4();

      logger.info({
        tenantId: req.context?.tenant_id,
        conversationId,
        hasAudio: !!data.audio || !!data.audio_url,
        hasText: !!data.text,
        language: data.language,
      }, 'Voice chat request started');

      // If audio provided, transcribe first
      let transcript = data.text;
      let sttLatency: number | undefined;

      if (data.audio || data.audio_url) {
        const sttStart = Date.now();
        const sttResult = await proxyRequest<{ text: string; language: string }>({
          service: 'stt',
          method: 'POST',
          path: '/v1/transcribe',
          data: {
            audio: data.audio,
            audio_url: data.audio_url,
            language: data.language,
          },
          headers: {
            'X-Tenant-ID': req.context!.tenant_id,
            'X-Request-ID': req.context!.request_id,
          },
        });
        transcript = sttResult.data.text;
        sttLatency = Date.now() - sttStart;
      }

      if (!transcript) {
        throw new GatewayError(400, 'Either audio or text is required', 'VALIDATION_ERROR');
      }

      // Send to LLM via orchestrator
      const llmStart = Date.now();
      const llmResult = await proxyRequest<{
        response: string;
        tool_calls?: Array<{ name: string; arguments: Record<string, unknown>; result?: unknown }>;
      }>({
        service: 'orchestrator',
        method: 'POST',
        path: '/v1/chat',
        data: {
          tenant_id: req.context!.tenant_id,
          conversation_id: conversationId,
          text: transcript,
          language: data.language,
          persona_id: data.persona_id,
          metadata: data.metadata,
        },
        headers: {
          'X-Tenant-ID': req.context!.tenant_id,
          'X-Request-ID': req.context!.request_id,
        },
      });
      const llmLatency = Date.now() - llmStart;

      // Generate TTS response
      const ttsStart = Date.now();
      const ttsResult = await proxyRequest<{ audio_base64: string; audio_url?: string }>({
        service: 'tts',
        method: 'POST',
        path: '/v1/synthesize',
        data: {
          text: llmResult.data.response,
          language: data.language,
          persona_id: data.persona_id,
        },
        headers: {
          'X-Tenant-ID': req.context!.tenant_id,
          'X-Request-ID': req.context!.request_id,
        },
      });
      const ttsLatency = Date.now() - ttsStart;

      const totalLatency = Date.now() - startTime;

      logger.info({
        tenantId: req.context?.tenant_id,
        conversationId,
        sttLatency,
        llmLatency,
        ttsLatency,
        totalLatency,
      }, 'Voice chat completed');

      res.json({
        success: true,
        data: {
          conversation_id: conversationId,
          response_text: llmResult.data.response,
          audio_base64: ttsResult.data.audio_base64,
          audio_url: ttsResult.data.audio_url,
          detected_language: data.language,
          transcript,
          tool_calls: llmResult.data.tool_calls,
          metadata: {
            stt_latency_ms: sttLatency,
            llm_latency_ms: llmLatency,
            tts_latency_ms: ttsLatency,
            total_latency_ms: totalLatency,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /v1/voice/transcribe
 * STT only endpoint
 */
router.post(
  '/transcribe',
  authenticate,
  requireScope('voice', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await proxyRequest({
        service: 'stt',
        method: 'POST',
        path: '/v1/transcribe',
        data: req.body,
        headers: {
          'X-Tenant-ID': req.context!.tenant_id,
          'X-Request-ID': req.context!.request_id,
        },
      });

      res.json({
        success: true,
        data: result.data,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /v1/voice/synthesize
 * TTS only endpoint
 */
router.post(
  '/synthesize',
  authenticate,
  requireScope('voice', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await proxyRequest({
        service: 'tts',
        method: 'POST',
        path: '/v1/synthesize',
        data: req.body,
        headers: {
          'X-Tenant-ID': req.context!.tenant_id,
          'X-Request-ID': req.context!.request_id,
        },
      });

      res.json({
        success: true,
        data: result.data,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /v1/voice/personas
 * List available voice personas
 */
router.get(
  '/personas',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await proxyRequest({
        service: 'tts',
        method: 'GET',
        path: '/v1/personas',
        headers: {
          'X-Tenant-ID': req.context!.tenant_id,
          'X-Request-ID': req.context!.request_id,
        },
      });

      res.json({
        success: true,
        data: result.data,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /v1/voice/languages
 * List supported languages
 */
router.get(
  '/languages',
  async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        languages: [
          { code: 'en', name: 'English' },
          { code: 'ta', name: 'Tamil' },
          { code: 'hi', name: 'Hindi' },
          { code: 'te', name: 'Telugu' },
          { code: 'kn', name: 'Kannada' },
          { code: 'ml', name: 'Malayalam' },
          { code: 'bn', name: 'Bengali' },
          { code: 'gu', name: 'Gujarati' },
          { code: 'mr', name: 'Marathi' },
          { code: 'pa', name: 'Punjabi' },
          { code: 'or', name: 'Odia' },
        ],
      },
    });
  }
);

export default router;
