import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { httpRequestsTotal, httpRequestDuration } from '../utils/metrics.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(401, message, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(403, message, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(404, `${resource} not found`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super(429, 'Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', { retryAfter });
    this.name = 'RateLimitError';
  }
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = req.headers['x-request-id'] as string;
  const duration = req.startTime ? (Date.now() - req.startTime) / 1000 : 0;

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: unknown = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code || 'ERROR';
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid request data';
    details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
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
  });
  httpRequestDuration.observe(
    { method: req.method, path: req.route?.path || req.path, status: statusCode },
    duration
  );

  const response: ErrorResponse = {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    ...(requestId ? { requestId } : {}),
  };

  res.status(statusCode).json(response);
};

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(new NotFoundError('Endpoint'));
};
