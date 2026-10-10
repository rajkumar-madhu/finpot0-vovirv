import { Request, Response, NextFunction } from 'express';
import { AuthenticationError } from './errorHandler.js';
import { logger } from '../utils/logger.js';

export const authenticateRequest = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const tenantId = req.headers['x-tenant-id'] as string;
  const apiKey = req.headers['x-api-key'] as string;
  const authHeader = req.headers.authorization as string;

  if (!tenantId) {
    next(new AuthenticationError('X-Tenant-ID header is required'));
    return;
  }

  if (!apiKey && !authHeader) {
    next(new AuthenticationError('X-API-Key or Authorization header required'));
    return;
  }

  req.context = {
    tenant_id: tenantId,
    request_id: (req.headers['x-request-id'] as string) || '',
  };

  next();
};

export const optionalAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const tenantId = req.headers['x-tenant-id'] as string;

  req.context = {
    tenant_id: tenantId || undefined,
    request_id: (req.headers['x-request-id'] as string) || '',
  };

  next();
};
