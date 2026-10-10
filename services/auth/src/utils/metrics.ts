import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

// Collect default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register: registry });

// HTTP request metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// Auth-specific metrics
export const authAttemptsTotal = new Counter({
  name: 'auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['type', 'status'], // type: jwt, api_key; status: success, failure
  registers: [registry],
});

export const activeApiKeys = new Gauge({
  name: 'active_api_keys',
  help: 'Number of active API keys',
  labelNames: ['tenant_id', 'plan'],
  registers: [registry],
});

export const rateLimitHits = new Counter({
  name: 'rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['tenant_id', 'plan'],
  registers: [registry],
});

export const tenantsTotal = new Gauge({
  name: 'tenants_total',
  help: 'Total number of tenants',
  labelNames: ['plan', 'status'], // status: active, inactive
  registers: [registry],
});

export const usersTotal = new Gauge({
  name: 'users_total',
  help: 'Total number of users',
  labelNames: ['tenant_id', 'role'],
  registers: [registry],
});

// Database metrics
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation'], // operation: select, insert, update, delete
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [registry],
});

export const dbConnectionPoolSize = new Gauge({
  name: 'db_connection_pool_size',
  help: 'Database connection pool size',
  labelNames: ['state'], // state: total, idle, waiting
  registers: [registry],
});

// Redis metrics
export const redisOperationsTotal = new Counter({
  name: 'redis_operations_total',
  help: 'Total number of Redis operations',
  labelNames: ['operation', 'status'],
  registers: [registry],
});

export const getMetrics = async (): Promise<string> => {
  return registry.metrics();
};

export const getContentType = (): string => {
  return registry.contentType;
};
