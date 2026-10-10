import { config } from '../config.js';
import { createChildLogger } from '../utils/logger.js';
import { pipelineStageDuration, llmTokensUsed } from '../utils/metrics.js';
import type { LlmRequest, LlmResponse } from '../types/index.js';

export async function queryLlm(
  req: LlmRequest
): Promise<LlmResponse> {
  const startTime = Date.now();
  const log = createChildLogger({ requestId: req.requestId, service: 'llm' });

  try {
    const response = await fetch(`${config.flowiseUrl}/api/v1/prediction/${config.flowiseApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: req.messages[req.messages.length - 1]?.content || '',
        overrideConfig: {
          sessionId: req.requestId,
          ...(req.model ? { model: req.model } : {}),
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Flowise/LLM error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as { text?: string; totalInputTokens?: number; totalOutputTokens?: number };
    const duration = (Date.now() - startTime) / 1000;

    const model = req.model || 'claude-haiku';
    const inputTokens = data.totalInputTokens || 0;
    const outputTokens = data.totalOutputTokens || 0;

    llmTokensUsed.labels(req.tenantId, model).inc(inputTokens + outputTokens);

    pipelineStageDuration.labels('llm', 'success').observe(duration);
    log.info({ duration, model, inputTokens, outputTokens }, 'llm_complete');

    return {
      text: data.text || '',
      model,
      usage: { inputTokens, outputTokens },
      processingTime: duration,
    };
  } catch (err) {
    const duration = (Date.now() - startTime) / 1000;
    pipelineStageDuration.labels('llm', 'error').observe(duration);
    log.error({ err, duration }, 'llm_failed');
    throw err;
  }
}
