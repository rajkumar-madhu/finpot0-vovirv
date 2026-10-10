import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

// HTTP request metrics
export const httpRequestsTotal = new Counter({
  name: 'gateway_http_requests_total',
  help: 'Total number of HTTP requests through gateway',
  labelNames: ['method', 'path', 'status', 'service'],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'gateway_http_request_duration_seconds',
  help: 'HTTP request duration through gateway',
  labelNames: ['method', 'path', 'status', 'service'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// Upstream service metrics
export const upstreamRequestsTotal = new Counter({
  name: 'gateway_upstream_requests_total',
  help: 'Total requests to upstream services',
  labelNames: ['service', 'status'],
  registers: [registry],
});

export const upstreamLatency = new Histogram({
  name: 'gateway_upstream_latency_seconds',
  help: 'Latency of upstream service calls',
  labelNames: ['service'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

// Rate limiting metrics
export const rateLimitHits = new Counter({
  name: 'gateway_rate_limit_hits_total',
  help: 'Total rate limit hits',
  labelNames: ['tenant_id'],
  registers: [registry],
});

// Circuit breaker metrics
export const circuitBreakerState = new Gauge({
  name: 'gateway_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['service'],
  registers: [registry],
});

// Active connections
export const activeConnections = new Gauge({
  name: 'gateway_active_connections',
  help: 'Number of active connections',
  registers: [registry],
});

// Twilio call metrics
export const twilioCallsTotal = new Counter({
  name: 'gateway_twilio_calls_total',
  help: 'Total Twilio calls',
  labelNames: ['direction', 'status'],
  registers: [registry],
});

export const twilioCallDuration = new Histogram({
  name: 'gateway_twilio_call_duration_seconds',
  help: 'Twilio call duration in seconds',
  labelNames: ['status'],
  buckets: [10, 30, 60, 120, 300, 600, 1800],
  registers: [registry],
});

export const twilioActiveConversations = new Gauge({
  name: 'gateway_twilio_active_conversations',
  help: 'Number of active Twilio conversations',
  registers: [registry],
});

export const getMetrics = async (): Promise<string> => {
  return registry.metrics();
};

export const getContentType = (): string => {
  return registry.contentType;
};
