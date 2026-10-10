import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { logger, createChildLogger } from '../utils/logger.js';
import { searchKnowledge } from '../services/ragService.js';
import { queryLlm } from '../services/llmService.js';
import { getHistory, appendTurns, deleteHistory } from '../services/conversationService.js';
import { recordUsage } from '../services/usageService.js';
import { authenticateRequest } from '../middleware/auth.js';
import { ValidationError } from '../middleware/errorHandler.js';

const router = Router();

const TextChatSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  conversationId: z.string().optional(),
  useRag: z.boolean().optional().default(true),
  model: z.enum(['haiku', 'sonnet']).optional().default('haiku'),
  systemPrompt: z.string().optional(),
});

router.post(
  '/chat',
  authenticateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    const tenantId = req.context?.tenant_id || 'unknown';
    const log = createChildLogger({ requestId, tenantId });

    try {
      const parsed = TextChatSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid request', parsed.error.errors);
      }

      const { message, conversationId: incomingConversationId, useRag, model, systemPrompt } = parsed.data;

      // New conversation if caller doesn't supply one
      const conversationId = incomingConversationId || uuidv4();

      log.info('chat_start', { messageLength: message.length, useRag, model, conversationId });

      const [ragResults, history] = await Promise.all([
        useRag ? searchKnowledge({ query: message, tenantId, topK: 5, requestId }) : undefined,
        getHistory(tenantId, conversationId),
      ]);

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
      llmMessages.push({ role: 'user', content: message });

      const llmResult = await queryLlm({
        messages: llmMessages,
        tenantId,
        requestId,
        model: model === 'sonnet' ? 'claude-sonnet' : 'claude-haiku',
      });

      await appendTurns(tenantId, conversationId, message, llmResult.text);

      // Fire-and-forget — must not block or fail the response
      recordUsage([
        { tenantId, eventType: 'llm_token',    value: llmResult.usage.inputTokens + llmResult.usage.outputTokens, metadata: { model: llmResult.model } },
        { tenantId, eventType: 'chat_request', value: 1,                                                          metadata: { conversationId, requestId } },
      ]);

      log.info({
        llmDuration: llmResult.processingTime,
        model: llmResult.model,
        ragResultsCount: ragResults?.results?.length || 0,
        conversationId,
        historyTurns: history.length / 2,
      }, 'chat_complete');

      res.json({
        reply: llmResult.text,
        conversationId,
        model: llmResult.model,
        usage: llmResult.usage,
        processingTime: llmResult.processingTime,
        ragResultsCount: ragResults?.results?.length || 0,
        requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/chat/:conversationId',
  authenticateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = req.context?.tenant_id || 'unknown';
    try {
      await deleteHistory(tenantId, req.params.conversationId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
