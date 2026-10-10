import { Request, Response, NextFunction } from 'express';
import { incrementRateLimit } from '../db/redis.js';
import { query } from '../db/postgres.js';
import { rateLimitHits } from '../utils/metrics.js';
import { RateLimitError } from './errorHandler.js';
import { RATE_LIMITS, type Plan } from '../types/index.js';
import { logger } from '../utils/logger.js';

const WINDOW_SECONDS = 60; // 1 minute window

interface TenantPlan {
  plan: Plan;
}

/**
 * Rate limiter middleware based on tenant plan
 */
export const rateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.context?.tenant_id) {
    return next();
  }

  try {
    // Get tenant plan
    const tenants = await query<TenantPlan>(
      'SELECT plan FROM tenants WHERE id = $1 AND is_active = true',
      [req.context.tenant_id]
    );

    if (tenants.length === 0) {
      return next();
    }

    const plan = tenants[0].plan;
    const limit = RATE_LIMITS[plan];
    const key = `ratelimit:${req.context.tenant_id}:${Math.floor(Date.now() / (WINDOW_SECONDS * 1000))}`;

    const current = await incrementRateLimit(key, WINDOW_SECONDS);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current));
    res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + WINDOW_SECONDS);

    if (current > limit) {
      rateLimitHits.inc({ tenant_id: req.context.tenant_id, plan });
      logger.warn({
        tenantId: req.context.tenant_id,
        plan,
        current,
        limit,
      }, 'Rate limit exceeded');

      return next(new RateLimitError(WINDOW_SECONDS));
    }

    next();
  } catch (err) {
    // On Redis error, allow request to proceed (fail open)
    logger.error({ err }, 'Rate limiter error, allowing request');
    next();
  }
};

/**
 * Create a custom rate limiter with specific limits
 */
export const createRateLimiter = (
  maxRequests: number,
  windowSeconds: number = 60
) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const identifier = req.context?.tenant_id || req.ip;
    const key = `ratelimit:custom:${identifier}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;

    try {
      const current = await incrementRateLimit(key, windowSeconds);

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current));
      res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + windowSeconds);

      if (current > maxRequests) {
        return next(new RateLimitError(windowSeconds));
      }

      next();
    } catch (err) {
      logger.error({ err }, 'Custom rate limiter error, allowing request');
      next();
    }
  };
};

/**
 * Strict rate limiter for sensitive endpoints (login, password reset)
 */
export const strictRateLimiter = createRateLimiter(5, 300); // 5 requests per 5 minutes
