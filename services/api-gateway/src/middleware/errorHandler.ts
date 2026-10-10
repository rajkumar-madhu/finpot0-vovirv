import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AxiosError } from 'axios';
import { logger } from '../utils/logger.js';
import { httpRequestsTotal, httpRequestDuration } from '../utils/metrics.js';
import { AuthError } from './auth.js';
import type { ErrorResponse } from '../types/index.js';

export class GatewayError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code: string = 'GATEWAY_ERROR',
    public details?: unknown
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export class ServiceUnavailableError extends GatewayError {
  constructor(service: string) {
    super(503, `Service unavailable: ${service}`, 'SERVICE_UNAVAILABLE');
  }
}

export class RateLimitError extends GatewayError {
  constructor(retryAfter?: number) {
    super(429, 'Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', { retryAfter });
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = req.headers['x-request-id'] as string || 'unknown';
  const duration = req.startTime ? (Date.now() - req.startTime) / 1000 : 0;

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: unknown = undefined;

  if (err instanceof GatewayError || err instanceof AuthError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = 'details' in err ? err.details : undefined;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid request data';
    details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
  } else if (err instanceof AxiosError) {
    // Upstream service error
    statusCode = err.response?.status || 502;
    code = 'UPSTREAM_ERROR';
    message = err.response?.data?.error?.message || 'Upstream service error';
    details = {
      service: err.config?.baseURL,
      timeout: err.code === 'ECONNABORTED',
    };
  }

  // Log error
  const logContext = {
    err: statusCode >= 500 ? err : undefined,
    statusCode,
    code,
    requestId,
    method: req.method,
    path: req.path,
    duration,
    tenantId: req.context?.tenant_id,
  };

  if (statusCode >= 500) {
    logger.error(logContext, message);
  } else {
    logger.warn(logContext, message);
  }

  // Update metrics
  httpRequestsTotal.inc({
    method: req.method,
    path: req.route?.path || req.path,
    status: statusCode,
    service: 'gateway',
  });
  httpRequestDuration.observe(
    {
      method: req.method,
      path: req.route?.path || req.path,
      status: statusCode,
      service: 'gateway',
    },
    duration
  );

  const response: ErrorResponse = {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    request_id: requestId,
  };

  res.status(statusCode).json(response);
};

export const notFoundHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  next(new GatewayError(404, 'Endpoint not found', 'NOT_FOUND'));
};
