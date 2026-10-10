import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { config, SERVICES } from '../config.js';
import { logger } from '../utils/logger.js';
import type { JwtPayload, RequestContext } from '../types/index.js';

export class AuthError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = 'AUTH_ERROR'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Validate JWT token locally
 */
export const validateJwt = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthError(401, 'Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);

    // Verify token locally for speed
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;

    if (payload.type !== 'access') {
      throw new AuthError(401, 'Invalid token type');
    }

    req.context = {
      tenant_id: payload.tenant_id,
      user_id: payload.sub,
      request_id: req.headers['x-request-id'] as string || '',
    };

    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      next(new AuthError(401, 'Invalid token'));
    } else if (err instanceof jwt.TokenExpiredError) {
      next(new AuthError(401, 'Token expired'));
    } else {
      next(err);
    }
  }
};

/**
 * Validate API key via auth service
 */
export const validateApiKey = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new AuthError(401, 'Missing X-API-Key header');
    }

    // Validate via auth service
    const response = await axios.post(
      `${SERVICES.auth}/internal/validate-api-key`,
      {},
      {
        headers: {
          'X-API-Key': apiKey,
          'X-Request-ID': req.headers['x-request-id'],
        },
        timeout: 5000,
      }
    );

    req.context = {
      tenant_id: response.data.tenant_id,
      api_key_id: response.data.api_key_id,
      scopes: response.data.scopes,
      request_id: req.headers['x-request-id'] as string || '',
    };

    next();
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status || 500;
      const message = err.response?.data?.error?.message || 'API key validation failed';
      next(new AuthError(status, message));
    } else {
      next(err);
    }
  }
};

/**
 * Allow either JWT or API key
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const hasJwt = req.headers.authorization?.startsWith('Bearer ');
  const hasApiKey = !!req.headers['x-api-key'];

  if (hasJwt) {
    return validateJwt(req, res, next);
  } else if (hasApiKey) {
    return validateApiKey(req, res, next);
  } else {
    next(new AuthError(401, 'Authentication required'));
  }
};

/**
 * Optional authentication - continues if no auth provided
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const hasAuth = req.headers.authorization || req.headers['x-api-key'];

  if (!hasAuth) {
    return next();
  }

  return authenticate(req, res, next);
};

/**
 * Require specific scope for API key auth
 */
export const requireScope = (...scopes: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.context?.scopes) {
      return next(); // JWT auth, no scope check
    }

    const hasScope = scopes.some((s) => req.context!.scopes!.includes(s));
    if (!hasScope) {
      logger.warn({
        apiKeyId: req.context.api_key_id,
        required: scopes,
        actual: req.context.scopes,
      }, 'Insufficient scope');
      return next(new AuthError(403, `Required scope: ${scopes.join(' or ')}`));
    }

    next();
  };
};
