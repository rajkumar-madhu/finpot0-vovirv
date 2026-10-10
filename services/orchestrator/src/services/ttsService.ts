import { config } from '../config.js';
import { createChildLogger } from '../utils/logger.js';
import { pipelineStageDuration } from '../utils/metrics.js';
import type { TtsRequest, TtsResponse } from '../types/index.js';

// Whisper returns ISO 639-1 two-letter codes; IndicF5 expects three-letter codes
const WHISPER_TO_INDICF5: Record<string, string> = {
  en: 'eng',
  ta: 'tam',
  hi: 'hin',
  te: 'tel',
  kn: 'kan',
  ml: 'mal',
  bn: 'ben',
  gu: 'guj',
  mr: 'mar',
  pa: 'pun',
  or: 'ori',
};

function resolveLanguage(lang: string | undefined): string {
  if (!lang) return 'eng';
  // Normalize region suffixes like "en-US" → "en"
  const base = lang.split('-')[0].toLowerCase();
  return WHISPER_TO_INDICF5[base] ?? base;
}

export async function synthesizeSpeech(
  req: TtsRequest
): Promise<TtsResponse> {
  const startTime = Date.now();
  const log = createChildLogger({ requestId: req.requestId, service: 'tts' });
  const language = resolveLanguage(req.language);

  try {
    const response = await fetch(`${config.ttsUrl}/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': req.tenantId || '',
        'X-Request-ID': req.requestId,
      },
      body: JSON.stringify({
        text: req.text,
        speed: req.speed || 1.0,
        language,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TTS service error (${response.status}): ${errorText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    const duration = (Date.now() - startTime) / 1000;

    pipelineStageDuration.labels('tts', 'success').observe(duration);
    log.info({ duration, textLength: req.text.length, language }, 'tts_complete');

    return {
      audioBase64,
      mimeType: 'audio/wav',
      processingTime: parseFloat(response.headers.get('X-Processing-Time') || '0'),
    };
  } catch (err) {
    const duration = (Date.now() - startTime) / 1000;
    pipelineStageDuration.labels('tts', 'error').observe(duration);
    log.error({ err, duration }, 'tts_failed');
    throw err;
  }
}
