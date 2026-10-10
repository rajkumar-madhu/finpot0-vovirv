import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as webhookService from '../services/webhookService.js';
import { CreateWebhookSchema, UpdateWebhookSchema } from '../types/index.js';
import { authenticate, requireRole, enforceTenantIsolation } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

/**
 * POST /webhooks
 * Register a new webhook
 */
router.post(
  '/',
  authenticate,
  requireRole('admin'),
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = CreateWebhookSchema.parse({
        ...req.body,
        tenant_id: req.context!.tenant_id,
      });

      const webhook = await webhookService.createWebhook(data);

      res.status(201).json({
        success: true,
        data: { webhook },
        message: 'Store the secret securely - use it to verify webhook signatures',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /webhooks
 * List all webhooks for current tenant
 */
router.get(
  '/',
  authenticate,
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const webhooks = await webhookService.listWebhooks(
        req.context!.tenant_id,
        includeInactive
      );

      // Strip secrets from list response
      const sanitized = webhooks.map(({ secret, ...rest }) => rest);

      res.json({
        success: true,
        data: { webhooks: sanitized },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /webhooks/:webhook_id
 * Get webhook details
 */
router.get(
  '/:webhook_id',
  authenticate,
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const webhook = await webhookService.getWebhookById(
        req.params.webhook_id,
        req.context!.tenant_id
      );

      // Mask secret (show first 10 chars only)
      const masked = {
        ...webhook,
        secret: webhook.secret.substring(0, 10) + '...',
      };

      res.json({
        success: true,
        data: { webhook: masked },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /webhooks/:webhook_id
 * Update webhook
 */
router.patch(
  '/:webhook_id',
  authenticate,
  requireRole('admin'),
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = UpdateWebhookSchema.parse(req.body);

      const webhook = await webhookService.updateWebhook(
        req.params.webhook_id,
        req.context!.tenant_id,
        data
      );

      const { secret, ...sanitized } = webhook;

      res.json({
        success: true,
        data: { webhook: sanitized },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /webhooks/:webhook_id
 * Delete a webhook
 */
router.delete(
  '/:webhook_id',
  authenticate,
  requireRole('admin'),
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await webhookService.deleteWebhook(
        req.params.webhook_id,
        req.context!.tenant_id
      );

      res.json({
        success: true,
        message: 'Webhook deleted',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /webhooks/:webhook_id/rotate-secret
 * Regenerate webhook signing secret
 */
router.post(
  '/:webhook_id/rotate-secret',
  authenticate,
  requireRole('admin'),
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const webhook = await webhookService.rotateWebhookSecret(
        req.params.webhook_id,
        req.context!.tenant_id
      );

      res.json({
        success: true,
        data: { webhook },
        message: 'Store the new secret securely',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /webhooks/:webhook_id/test
 * Send a test event to the webhook
 */
router.post(
  '/:webhook_id/test',
  authenticate,
  requireRole('admin'),
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const delivery = await webhookService.testWebhook(
        req.params.webhook_id,
        req.context!.tenant_id
      );

      res.json({
        success: true,
        data: { delivery },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /webhooks/:webhook_id/deliveries
 * List recent deliveries for a webhook
 */
router.get(
  '/:webhook_id/deliveries',
  authenticate,
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limitSchema = z.coerce.number().int().min(1).max(100).default(20);
      const limit = limitSchema.parse(req.query.limit);

      const deliveries = await webhookService.listDeliveries(
        req.params.webhook_id,
        req.context!.tenant_id,
        limit
      );

      res.json({
        success: true,
        data: { deliveries },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
