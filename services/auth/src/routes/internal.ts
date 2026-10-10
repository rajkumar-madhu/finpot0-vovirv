import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { recordUsageEvents } from '../services/tenantService.js';
import { AuthenticationError } from '../middleware/errorHandler.js';

const router = Router();

const verifyServiceKey = (req: Request, _res: Response, next: NextFunction): void => {
  if (config.internalServiceKey) {
    // Key is configured — validate it regardless of environment
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (token !== config.internalServiceKey) {
      next(new AuthenticationError('Invalid service key'));
      return;
    }
  } else if (config.nodeEnv === 'production') {
    // No key configured in production — reject
    next(new AuthenticationError('Internal service key not configured'));
    return;
  }
  // No key configured in non-production — allow (dev convenience)
  next();
};

const RecordUsageSchema = z.object({
  events: z
    .array(
      z.object({
        tenantId: z.string().uuid(),
        eventType: z.string().max(50),
        value: z.number().positive(),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .min(1)
    .max(50),
});

router.post(
  '/usage',
  verifyServiceKey,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { events } = RecordUsageSchema.parse(req.body);
      await recordUsageEvents(events);
      res.status(202).json({ success: true, recorded: events.length });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
