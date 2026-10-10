import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { SERVICES, ServiceName } from '../config.js';
import { logger } from '../utils/logger.js';
import { upstreamRequestsTotal, upstreamLatency, circuitBreakerState } from '../utils/metrics.js';

// Circuit breaker states
enum CircuitState {
  CLOSED = 0,
  HALF_OPEN = 1,
  OPEN = 2,
}

interface CircuitBreaker {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  successCount: number;
}

const FAILURE_THRESHOLD = 5;
const RECOVERY_TIMEOUT = 30000; // 30 seconds
const SUCCESS_THRESHOLD = 3;

// Circuit breakers per service
const circuitBreakers: Map<ServiceName, CircuitBreaker> = new Map();

// Initialize circuit breakers
for (const service of Object.keys(SERVICES) as ServiceName[]) {
  circuitBreakers.set(service, {
    state: CircuitState.CLOSED,
    failures: 0,
    lastFailure: 0,
    successCount: 0,
  });
  circuitBreakerState.set({ service }, CircuitState.CLOSED);
}

/**
 * Check if circuit is open
 */
const isCircuitOpen = (service: ServiceName): boolean => {
  const breaker = circuitBreakers.get(service)!;

  if (breaker.state === CircuitState.OPEN) {
    // Check if recovery timeout has passed
    if (Date.now() - breaker.lastFailure > RECOVERY_TIMEOUT) {
      breaker.state = CircuitState.HALF_OPEN;
      breaker.successCount = 0;
      circuitBreakerState.set({ service }, CircuitState.HALF_OPEN);
      logger.info({ service }, 'Circuit breaker half-open');
      return false;
    }
    return true;
  }

  return false;
};

/**
 * Record success for circuit breaker
 */
const recordSuccess = (service: ServiceName): void => {
  const breaker = circuitBreakers.get(service)!;

  if (breaker.state === CircuitState.HALF_OPEN) {
    breaker.successCount++;
    if (breaker.successCount >= SUCCESS_THRESHOLD) {
      breaker.state = CircuitState.CLOSED;
      breaker.failures = 0;
      circuitBreakerState.set({ service }, CircuitState.CLOSED);
      logger.info({ service }, 'Circuit breaker closed');
    }
  } else if (breaker.state === CircuitState.CLOSED) {
    breaker.failures = 0;
  }
};

/**
 * Record failure for circuit breaker
 */
const recordFailure = (service: ServiceName): void => {
  const breaker = circuitBreakers.get(service)!;

  breaker.failures++;
  breaker.lastFailure = Date.now();

  if (breaker.state === CircuitState.HALF_OPEN) {
    breaker.state = CircuitState.OPEN;
    circuitBreakerState.set({ service }, CircuitState.OPEN);
    logger.warn({ service }, 'Circuit breaker opened (half-open failure)');
  } else if (breaker.failures >= FAILURE_THRESHOLD) {
    breaker.state = CircuitState.OPEN;
    circuitBreakerState.set({ service }, CircuitState.OPEN);
    logger.warn({ service, failures: breaker.failures }, 'Circuit breaker opened');
  }
};

/**
 * Create axios instance for a service
 */
const createClient = (service: ServiceName): AxiosInstance => {
  return axios.create({
    baseURL: SERVICES[service],
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

export interface ProxyOptions {
  service: ServiceName;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  data?: unknown;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface ProxyResult<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

/**
 * Proxy request to upstream service with circuit breaker
 */
export const proxyRequest = async <T = unknown>(
  options: ProxyOptions
): Promise<ProxyResult<T>> => {
  const { service, method, path, data, params, headers, timeout } = options;

  // Check circuit breaker
  if (isCircuitOpen(service)) {
    upstreamRequestsTotal.inc({ service, status: 'circuit_open' });
    throw new Error(`Circuit breaker open for ${service}`);
  }

  const client = createClient(service);
  const startTime = Date.now();

  const config: AxiosRequestConfig = {
    method,
    url: path,
    data,
    params,
    headers,
    timeout: timeout || 30000,
  };

  try {
    const response = await client.request<T>(config);
    const latency = (Date.now() - startTime) / 1000;

    // Record metrics
    upstreamLatency.observe({ service }, latency);
    upstreamRequestsTotal.inc({ service, status: 'success' });
    recordSuccess(service);

    logger.debug({
      service,
      method,
      path,
      status: response.status,
      latency,
    }, 'Upstream request completed');

    return {
      data: response.data,
      status: response.status,
      headers: response.headers as Record<string, string>,
    };
  } catch (err) {
    const latency = (Date.now() - startTime) / 1000;
    upstreamLatency.observe({ service }, latency);

    if (err instanceof AxiosError) {
      const status = err.response?.status || 0;

      // Only trigger circuit breaker for server errors or timeouts
      if (status >= 500 || err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED') {
        upstreamRequestsTotal.inc({ service, status: 'failure' });
        recordFailure(service);
      } else {
        upstreamRequestsTotal.inc({ service, status: 'client_error' });
      }

      logger.error({
        service,
        method,
        path,
        status,
        error: err.message,
        latency,
      }, 'Upstream request failed');
    }

    throw err;
  }
};

/**
 * Check health of all services
 */
export const checkServicesHealth = async (): Promise<
  Record<ServiceName, { healthy: boolean; latency?: number; error?: string }>
> => {
  const results: Record<string, { healthy: boolean; latency?: number; error?: string }> = {};

  await Promise.all(
    (Object.keys(SERVICES) as ServiceName[]).map(async (service) => {
      const startTime = Date.now();
      try {
        await proxyRequest({
          service,
          method: 'GET',
          path: '/health',
          timeout: 5000,
        });
        results[service] = {
          healthy: true,
          latency: Date.now() - startTime,
        };
      } catch (err) {
        results[service] = {
          healthy: false,
          latency: Date.now() - startTime,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    })
  );

  return results as Record<ServiceName, { healthy: boolean; latency?: number; error?: string }>;
};
