import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createChildLogger } from '../utils/logger.js';
import { authenticateRequest } from '../middleware/auth.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { enqueueDocument } from '../services/ingestionService.js';

const router = Router();

const IngestSchema = z.object({
  text: z.string().min(1, 'Document text is required'),
  source: z.string().default('api'),
  metadata: z.record(z.unknown()).optional().default({}),
});

router.post(
  '/ingest',
  authenticateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    const tenantId = req.context?.tenant_id || 'unknown';
    const log = createChildLogger({ requestId, tenantId });

    try {
      const parsed = IngestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid request', parsed.error.errors);
      }

      const { text, source, metadata } = parsed.data;

      log.info({ textLength: text.length, source }, 'ingest_request');

      const jobId = await enqueueDocument({
        tenantId,
        text,
        source,
        metadata,
        requestId,
      });

      log.info({ jobId }, 'ingest_accepted');

      res.status(202).json({
        status: 'accepted',
        jobId,
        requestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
