import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'orchestrator_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'orchestrator_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const voicePipelineRequests = new Counter({
  name: 'orchestrator_voice_pipeline_requests_total',
  help: 'Total voice pipeline requests',
  labelNames: ['status', 'language'],
  registers: [registry],
});

export const voicePipelineDuration = new Histogram({
  name: 'orchestrator_voice_pipeline_duration_seconds',
  help: 'Full voice pipeline duration',
  labelNames: ['status'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  registers: [registry],
});

export const pipelineStageDuration = new Histogram({
  name: 'orchestrator_pipeline_stage_duration_seconds',
  help: 'Per-stage pipeline duration',
  labelNames: ['stage', 'status'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const sttBytesProcessed = new Counter({
  name: 'orchestrator_stt_bytes_processed_total',
  help: 'Total audio bytes sent to STT',
  labelNames: ['tenant_id'],
  registers: [registry],
});

export const ttsCharsProcessed = new Counter({
  name: 'orchestrator_tts_chars_synthesized_total',
  help: 'Total characters sent to TTS',
  labelNames: ['tenant_id'],
  registers: [registry],
});

export const llmTokensUsed = new Counter({
  name: 'orchestrator_llm_tokens_total',
  help: 'Total LLM tokens used',
  labelNames: ['tenant_id', 'model'],
  registers: [registry],
});

export const activeConnections = new Gauge({
  name: 'orchestrator_active_connections',
  help: 'Number of active WebSocket connections',
  labelNames: ['type'],
  registers: [registry],
});

export const serviceHealth = new Gauge({
  name: 'orchestrator_upstream_service_health',
  help: 'Health status of upstream services',
  labelNames: ['service'],
  registers: [registry],
});

export const getMetrics = async (): Promise<string> => {
  return registry.metrics();
};

export const getContentType = (): string => {
  return registry.contentType;
};
