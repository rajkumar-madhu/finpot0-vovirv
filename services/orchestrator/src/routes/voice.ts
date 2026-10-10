import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { logger, createChildLogger } from '../utils/logger.js';
import { voicePipelineRequests, voicePipelineDuration, sttBytesProcessed, ttsCharsProcessed } from '../utils/metrics.js';
import { transcribeAudio } from '../services/sttService.js';
import { synthesizeSpeech } from '../services/ttsService.js';
import { searchKnowledge } from '../services/ragService.js';
import { queryLlm } from '../services/llmService.js';
import { getHistory, appendTurns, deleteHistory } from '../services/conversationService.js';
import { recordUsage } from '../services/usageService.js';
import { authenticateRequest } from '../middleware/auth.js';
import { ValidationError } from '../middleware/errorHandler.js';

const router = Router();

const VoicePipelineSchema = z.object({
  audioBase64: z.string().min(1, 'Audio data is required'),
  mimeType: z.string().default('audio/wav'),
  sessionId: z.string().optional(),
  language: z.string().optional(),
  voice: z.string().optional(),
  speed: z.number().min(0.25).max(4.0).optional().default(1.0),
  useRag: z.boolean().optional().default(true),
  model: z.enum(['haiku', 'sonnet']).optional().default('haiku'),
  systemPrompt: z.string().optional(),
});

router.post(
  '/voice/chat',
  authenticateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    const tenantId = req.context?.tenant_id || 'unknown';
    const pipelineStart = Date.now();
    const log = createChildLogger({ requestId, tenantId });

    try {
      const parsed = VoicePipelineSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid request', parsed.error.errors);
      }

      const { audioBase64, mimeType, sessionId: incomingSessionId, language, voice, speed, useRag, model, systemPrompt } = parsed.data;

      // New session if caller doesn't supply one
      const sessionId = incomingSessionId || uuidv4();

      sttBytesProcessed.labels(tenantId).inc(Buffer.from(audioBase64, 'base64').length);

      log.info('pipeline_start', { audioSize: audioBase64.length, language, useRag, model, sessionId });

      const [sttResult, history] = await Promise.all([
        transcribeAudio({ audioBase64, mimeType, language, tenantId, requestId }),
        getHistory(tenantId, sessionId),
      ]);

      let ragResults: Awaited<ReturnType<typeof searchKnowledge>> | undefined;
      if (useRag && sttResult.text.trim()) {
        ragResults = await searchKnowledge({ query: sttResult.text, tenantId, topK: 5, requestId });
      }

      // Build messages: system → RAG context → history turns → current user turn
      const llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

      if (systemPrompt) {
        llmMessages.push({ role: 'system', content: systemPrompt });
      }

      if (ragResults?.results?.length) {
        const contextStr = ragResults.results.map((r, i) => `[${i + 1}] ${r.text}`).join('\n');
        llmMessages.push({ role: 'system', content: `Relevant context:\n${contextStr}` });
      }

      llmMessages.push(...history);
      llmMessages.push({ role: 'user', content: sttResult.text });

      const llmResult = await queryLlm({
        messages: llmMessages,
        tenantId,
        requestId,
        model: model === 'sonnet' ? 'claude-sonnet' : 'claude-haiku',
      });

      // Persist this turn before starting TTS so a TTS failure doesn't lose history
      await appendTurns(tenantId, sessionId, sttResult.text, llmResult.text);

      ttsCharsProcessed.labels(tenantId).inc(llmResult.text.length);

      const ttsResult = await synthesizeSpeech({
        text: llmResult.text,
        voice,
        speed,
        language: sttResult.language,
        tenantId,
        requestId,
      });

      const totalDuration = (Date.now() - pipelineStart) / 1000;

      voicePipelineRequests.labels('success', sttResult.language).inc();
      voicePipelineDuration.labels('success').observe(totalDuration);

      // Fire-and-forget — must not block or fail the response
      recordUsage([
        { tenantId, eventType: 'stt_second',    value: sttResult.duration,                                         metadata: { language: sttResult.language } },
        { tenantId, eventType: 'llm_token',     value: llmResult.usage.inputTokens + llmResult.usage.outputTokens, metadata: { model: llmResult.model } },
        { tenantId, eventType: 'tts_character', value: llmResult.text.length,                                      metadata: { language: sttResult.language } },
        { tenantId, eventType: 'voice_request', value: 1,                                                          metadata: { sessionId, requestId } },
      ]);

      log.info({
        totalDuration,
        sttDuration: sttResult.processingTime,
        llmDuration: llmResult.processingTime,
        ttsDuration: ttsResult.processingTime,
        ragResultsCount: ragResults?.results?.length || 0,
        language: sttResult.language,
        model: llmResult.model,
        sessionId,
        historyTurns: history.length / 2,
      }, 'pipeline_complete');

      res.json({
        transcript: sttResult.text,
        language: sttResult.language,
        replyText: llmResult.text,
        replyAudioBase64: ttsResult.audioBase64,
        audioMimeType: ttsResult.mimeType,
        sessionId,
        stages: {
          stt: { duration: sttResult.processingTime, status: 'success' },
          ...(ragResults ? { rag: { duration: ragResults.processingTime, status: 'success', resultsCount: ragResults.results.length } } : {}),
          llm: { duration: llmResult.processingTime, status: 'success', model: llmResult.model },
          tts: { duration: ttsResult.processingTime, status: 'success' },
        },
        totalDuration,
        requestId,
      });
    } catch (err) {
      const totalDuration = (Date.now() - pipelineStart) / 1000;
      voicePipelineRequests.labels('error', 'unknown').inc();
      voicePipelineDuration.labels('error').observe(totalDuration);
      next(err);
    }
  }
);

router.delete(
  '/voice/session/:sessionId',
  authenticateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = req.context?.tenant_id || 'unknown';
    try {
      await deleteHistory(tenantId, req.params.sessionId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
