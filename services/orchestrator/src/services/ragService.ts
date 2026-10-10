import { config } from '../config.js';
import { createChildLogger } from '../utils/logger.js';
import { pipelineStageDuration } from '../utils/metrics.js';
import type { RagRequest, RagResponse } from '../types/index.js';

export async function searchKnowledge(
  req: RagRequest
): Promise<RagResponse> {
  const startTime = Date.now();
  const log = createChildLogger({ requestId: req.requestId, service: 'rag' });

  try {
    const response = await fetch(`${config.ragUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': req.tenantId,
        'X-Request-ID': req.requestId,
      },
      body: JSON.stringify({
        query: req.query,
        top_k: req.topK || 5,
      }),
    });

    if (!response.ok) {
      if (response.status === 503) {
        log.warn('rag_service_unavailable, continuing without context');
        const duration = (Date.now() - startTime) / 1000;
        pipelineStageDuration.labels('rag', 'skipped').observe(duration);
        return { results: [], processingTime: duration };
      }
      const errorText = await response.text();
      throw new Error(`RAG service error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as { results?: Array<{ text: string; source: string; score: number; metadata?: Record<string, unknown> }>; processing_time?: number };
    const duration = (Date.now() - startTime) / 1000;

    pipelineStageDuration.labels('rag', 'success').observe(duration);
    log.info({ duration, resultsCount: data.results?.length }, 'rag_complete');

    return {
      results: data.results || [],
      processingTime: data.processing_time || duration,
    };
  } catch (err) {
    const duration = (Date.now() - startTime) / 1000;
    pipelineStageDuration.labels('rag', 'error').observe(duration);
    log.warn({ err, duration }, 'rag_failed, continuing without context');
    return { results: [], processingTime: duration };
  }
}
