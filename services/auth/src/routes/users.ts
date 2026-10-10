import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from '../services/authService.js';
import { CreateUserSchema } from '../types/index.js';
import { authenticate, requireRole, enforceTenantIsolation } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { query } from '../db/postgres.js';
import { NotFoundError } from '../middleware/errorHandler.js';

const router = Router();

/**
 * POST /users
 * Create a new user (admin only)
 */
router.post(
  '/',
  authenticate,
  requireRole('admin'),
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = CreateUserSchema.parse({
        ...req.body,
        tenant_id: req.context!.tenant_id,
      });

      const result = await authService.registerUser(data);

      res.status(201).json({
        success: true,
        data: { user: result.user },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /users
 * List users for current tenant
 */
router.get(
  '/',
  authenticate,
  requireRole('admin', 'user'),
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await authService.listUsers(
        req.context!.tenant_id,
        limit,
        offset
      );

      res.json({
        success: true,
        data: {
          users: result.users,
          pagination: {
            total: result.total,
            limit,
            offset,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /users/:user_id
 * Get user by ID
 */
router.get(
  '/:user_id',
  authenticate,
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.getUserById(
        req.params.user_id,
        req.context!.tenant_id
      );

      if (!user) {
        throw new NotFoundError('User');
      }

      res.json({
        success: true,
        data: { user },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /users/:user_id
 * Update user
 */
router.patch(
  '/:user_id',
  authenticate,
  requireRole('admin'),
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updateSchema = z.object({
        name: z.string().min(2).max(100).optional(),
        role: z.enum(['admin', 'user', 'viewer']).optional(),
        is_active: z.boolean().optional(),
      });

      const data = updateSchema.parse(req.body);

      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (data.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(data.name);
      }
      if (data.role !== undefined) {
        updates.push(`role = $${paramIndex++}`);
        values.push(data.role);
      }
      if (data.is_active !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        values.push(data.is_active);
      }

      if (updates.length === 0) {
        const user = await authService.getUserById(
          req.params.user_id,
          req.context!.tenant_id
        );
        return res.json({ success: true, data: { user } });
      }

      updates.push(`updated_at = NOW()`);
      values.push(req.params.user_id, req.context!.tenant_id);

      const users = await query(
        `UPDATE users SET ${updates.join(', ')}
         WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
         RETURNING id, tenant_id, email, name, role, is_active, created_at, updated_at`,
        values
      );

      if (users.length === 0) {
        throw new NotFoundError('User');
      }

      res.json({
        success: true,
        data: { user: users[0] },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /users/:user_id
 * Deactivate user (soft delete)
 */
router.delete(
  '/:user_id',
  authenticate,
  requireRole('admin'),
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await query(
        `UPDATE users SET is_active = false, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2
         RETURNING id`,
        [req.params.user_id, req.context!.tenant_id]
      );

      if (result.length === 0) {
        throw new NotFoundError('User');
      }

      res.json({
        success: true,
        message: 'User deactivated',
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
