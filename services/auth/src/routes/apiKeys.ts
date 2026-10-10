import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as apiKeyService from '../services/apiKeyService.js';
import { CreateApiKeySchema } from '../types/index.js';
import { authenticate, requireRole, enforceTenantIsolation } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

/**
 * POST /api-keys
 * Create a new API key
 */
router.post(
  '/',
  authenticate,
  requireRole('admin'),
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = CreateApiKeySchema.parse({
        ...req.body,
        tenant_id: req.context!.tenant_id,
      });

      const result = await apiKeyService.createApiKey(data);

      res.status(201).json({
        success: true,
        data: {
          apiKey: result.apiKey,
          rawKey: result.rawKey,
        },
        message: 'Store this key securely - it will not be shown again',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api-keys
 * List all API keys for current tenant
 */
router.get(
  '/',
  authenticate,
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const keys = await apiKeyService.listApiKeys(
        req.context!.tenant_id,
        includeInactive
      );

      res.json({
        success: true,
        data: { apiKeys: keys },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api-keys/:key_id
 * Get API key by ID
 */
router.get(
  '/:key_id',
  authenticate,
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = await apiKeyService.getApiKeyById(
        req.params.key_id,
        req.context!.tenant_id
      );

      res.json({
        success: true,
        data: { apiKey: key },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api-keys/:key_id/scopes
 * Update API key scopes
 */
router.patch(
  '/:key_id/scopes',
  authenticate,
  requireRole('admin'),
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scopesSchema = z.object({
        scopes: z.array(z.string()),
      });
      const { scopes } = scopesSchema.parse(req.body);

      const key = await apiKeyService.updateApiKeyScopes(
        req.params.key_id,
        req.context!.tenant_id,
        scopes
      );

      res.json({
        success: true,
        data: { apiKey: key },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api-keys/:key_id/rotate
 * Rotate API key
 */
router.post(
  '/:key_id/rotate',
  authenticate,
  requireRole('admin'),
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await apiKeyService.rotateApiKey(
        req.params.key_id,
        req.context!.tenant_id
      );

      res.json({
        success: true,
        data: {
          apiKey: result.apiKey,
          rawKey: result.rawKey,
        },
        message: 'Store this key securely - it will not be shown again',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api-keys/:key_id
 * Revoke API key
 */
router.delete(
  '/:key_id',
  authenticate,
  requireRole('admin'),
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await apiKeyService.revokeApiKey(
        req.params.key_id,
        req.context!.tenant_id
      );

      res.json({
        success: true,
        message: 'API key revoked',
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
