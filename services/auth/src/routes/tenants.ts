import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as tenantService from '../services/tenantService.js';
import { CreateTenantSchema, UpdateTenantSchema } from '../types/index.js';
import { authenticate, requireRole, enforceTenantIsolation } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

/**
 * POST /tenants
 * Create a new tenant (public for signup)
 */
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = CreateTenantSchema.parse(req.body);
      const tenant = await tenantService.createTenant(data);

      res.status(201).json({
        success: true,
        data: { tenant },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /tenants/:tenant_id
 * Get tenant by ID
 */
router.get(
  '/:tenant_id',
  authenticate,
  enforceTenantIsolation,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenant = await tenantService.getTenantById(req.params.tenant_id);

      res.json({
        success: true,
        data: { tenant },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /tenants/:tenant_id
 * Update tenant
 */
router.patch(
  '/:tenant_id',
  authenticate,
  enforceTenantIsolation,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = UpdateTenantSchema.parse(req.body);
      const tenant = await tenantService.updateTenant(req.params.tenant_id, data);

      res.json({
        success: true,
        data: { tenant },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /tenants/:tenant_id/settings
 * Get tenant settings
 */
router.get(
  '/:tenant_id/settings',
  authenticate,
  enforceTenantIsolation,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await tenantService.getTenantSettings(req.params.tenant_id);

      res.json({
        success: true,
        data: { settings },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /tenants/:tenant_id/settings
 * Update tenant settings
 */
router.patch(
  '/:tenant_id/settings',
  authenticate,
  enforceTenantIsolation,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settingsSchema = z.record(z.unknown());
      const settings = settingsSchema.parse(req.body);
      const updated = await tenantService.updateTenantSettings(
        req.params.tenant_id,
        settings
      );

      res.json({
        success: true,
        data: { settings: updated },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /tenants/:tenant_id/usage
 * Get tenant usage metrics
 */
router.get(
  '/:tenant_id/usage',
  authenticate,
  enforceTenantIsolation,
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { start_date, end_date } = req.query;
      const usage = await tenantService.getTenantUsage(
        req.params.tenant_id,
        start_date ? new Date(start_date as string) : undefined,
        end_date ? new Date(end_date as string) : undefined
      );

      res.json({
        success: true,
        data: { usage },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /tenants/:tenant_id/deactivate
 * Deactivate tenant
 */
router.post(
  '/:tenant_id/deactivate',
  authenticate,
  enforceTenantIsolation,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await tenantService.deactivateTenant(req.params.tenant_id);

      res.json({
        success: true,
        message: 'Tenant deactivated',
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
