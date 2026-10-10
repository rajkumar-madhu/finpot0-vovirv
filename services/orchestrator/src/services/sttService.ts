import { config } from '../config.js';
import { logger, createChildLogger } from '../utils/logger.js';
import { pipelineStageDuration } from '../utils/metrics.js';
import type { SttRequest, SttResponse } from '../types/index.js';

export async function transcribeAudio(
  req: SttRequest
): Promise<SttResponse> {
  const startTime = Date.now();
  const log = createChildLogger({ requestId: req.requestId, service: 'stt' });

  try {
    const audioBuffer = Buffer.from(req.audioBase64, 'base64');
    const blob = new Blob([audioBuffer], { type: req.mimeType });

    const formData = new FormData();
    formData.append('file', blob, `audio.${req.mimeType.split('/')[1] || 'webm'}`);

    const url = new URL('/transcribe', config.sttUrl);
    if (req.language) url.searchParams.set('language', req.language);

    const response = await fetch(url.toString(), {
      method: 'POST',
      body: formData,
      headers: {
        'X-Tenant-ID': req.tenantId || '',
        'X-Request-ID': req.requestId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`STT service error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      text: string;
      language: string;
      language_probability: number;
      duration: number;
      segments: Array<{ start: number; end: number; text: string; avg_log_prob: number }>;
      processing_time: number;
    };
    const duration = (Date.now() - startTime) / 1000;

    pipelineStageDuration.labels('stt', 'success').observe(duration);
    log.info({ duration, textLength: data.text?.length }, 'stt_complete');

    return {
      text: data.text,
      language: data.language,
      languageProbability: data.language_probability,
      duration: data.duration,
      segments: data.segments.map((s) => ({ start: s.start, end: s.end, text: s.text, confidence: s.avg_log_prob })),
      processingTime: data.processing_time,
    };
  } catch (err) {
    const duration = (Date.now() - startTime) / 1000;
    pipelineStageDuration.labels('stt', 'error').observe(duration);
    log.error({ err, duration }, 'stt_failed');
    throw err;
  }
}
