import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { authAttemptsTotal } from '../utils/metrics.js';
import { isTokenBlacklisted } from '../db/redis.js';
import { query } from '../db/postgres.js';
import { AuthenticationError, AuthorizationError } from './errorHandler.js';
import type { JwtPayload, RequestContext, ApiKey } from '../types/index.js';
import bcrypt from 'bcrypt';

/**
 * Verify JWT token from Authorization header
 */
export const verifyJwt = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);

    // Check if token is blacklisted
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      authAttemptsTotal.inc({ type: 'jwt', status: 'failure' });
      throw new AuthenticationError('Token has been revoked');
    }

    // Verify token
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;

    if (payload.type !== 'access') {
      throw new AuthenticationError('Invalid token type');
    }

    // Set request context
    req.context = {
      tenant_id: payload.tenant_id,
      user_id: payload.sub,
    };

    authAttemptsTotal.inc({ type: 'jwt', status: 'success' });
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      authAttemptsTotal.inc({ type: 'jwt', status: 'failure' });
      next(new AuthenticationError('Invalid token'));
    } else if (err instanceof jwt.TokenExpiredError) {
      authAttemptsTotal.inc({ type: 'jwt', status: 'failure' });
      next(new AuthenticationError('Token expired'));
    } else {
      next(err);
    }
  }
};

/**
 * Verify API key from X-API-Key header
 */
export const verifyApiKey = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new AuthenticationError('Missing X-API-Key header');
    }

    // API key format: prefix_secretkey (e.g., vsk_abc123...)
    const parts = apiKey.split('_');
    if (parts.length !== 2) {
      authAttemptsTotal.inc({ type: 'api_key', status: 'failure' });
      throw new AuthenticationError('Invalid API key format');
    }

    const [prefix] = parts;

    // Find API key by prefix
    const keys = await query<ApiKey>(
      `SELECT id, tenant_id, key_hash, scopes, is_active, expires_at
       FROM api_keys
       WHERE key_prefix = $1 AND is_active = true`,
      [prefix]
    );

    if (keys.length === 0) {
      authAttemptsTotal.inc({ type: 'api_key', status: 'failure' });
      throw new AuthenticationError('Invalid API key');
    }

    const keyRecord = keys[0];

    // Check expiration
    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
      authAttemptsTotal.inc({ type: 'api_key', status: 'failure' });
      throw new AuthenticationError('API key expired');
    }

    // Verify key hash
    const isValid = await bcrypt.compare(apiKey, keyRecord.key_hash);
    if (!isValid) {
      authAttemptsTotal.inc({ type: 'api_key', status: 'failure' });
      throw new AuthenticationError('Invalid API key');
    }

    // Update last_used_at
    await query(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
      [keyRecord.id]
    );

    // Set request context
    req.context = {
      tenant_id: keyRecord.tenant_id,
      api_key_id: keyRecord.id,
      scopes: keyRecord.scopes,
    };

    authAttemptsTotal.inc({ type: 'api_key', status: 'success' });
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Allow either JWT or API key authentication
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const hasJwt = req.headers.authorization?.startsWith('Bearer ');
  const hasApiKey = !!req.headers['x-api-key'];

  if (hasJwt) {
    return verifyJwt(req, res, next);
  } else if (hasApiKey) {
    return verifyApiKey(req, res, next);
  } else {
    next(new AuthenticationError('Authentication required'));
  }
};

/**
 * Require specific role(s)
 */
export const requireRole = (...roles: string[]) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.context?.user_id) {
      return next(new AuthorizationError('User authentication required'));
    }

    try {
      const users = await query<{ role: string }>(
        'SELECT role FROM users WHERE id = $1 AND tenant_id = $2',
        [req.context.user_id, req.context.tenant_id]
      );

      if (users.length === 0) {
        return next(new AuthorizationError('User not found'));
      }

      if (!roles.includes(users[0].role)) {
        logger.warn({
          userId: req.context.user_id,
          requiredRoles: roles,
          actualRole: users[0].role,
        }, 'Authorization failed: insufficient role');
        return next(new AuthorizationError(`Required role: ${roles.join(' or ')}`));
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Require specific scope(s) for API key auth
 */
export const requireScope = (...scopes: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.context?.scopes) {
      return next(); // No scopes = JWT auth, skip scope check
    }

    const hasRequiredScope = scopes.some((s) => req.context!.scopes!.includes(s));
    if (!hasRequiredScope) {
      logger.warn({
        apiKeyId: req.context.api_key_id,
        requiredScopes: scopes,
        actualScopes: req.context.scopes,
      }, 'Authorization failed: insufficient scope');
      return next(new AuthorizationError(`Required scope: ${scopes.join(' or ')}`));
    }

    next();
  };
};

/**
 * Ensure tenant_id in request matches authenticated tenant
 */
export const enforceTenantIsolation = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const bodyTenantId = req.body?.tenant_id;
  const paramTenantId = req.params?.tenant_id;
  const queryTenantId = req.query?.tenant_id;

  const requestedTenantId = bodyTenantId || paramTenantId || queryTenantId;

  if (requestedTenantId && requestedTenantId !== req.context?.tenant_id) {
    logger.warn({
      authenticatedTenant: req.context?.tenant_id,
      requestedTenant: requestedTenantId,
    }, 'Tenant isolation violation attempt');
    return next(new AuthorizationError('Access denied to this tenant'));
  }

  next();
};
