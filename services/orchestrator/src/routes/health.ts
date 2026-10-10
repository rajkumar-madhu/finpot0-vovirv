import { Router, Request, Response } from 'express';
import { getMetrics, getContentType } from '../utils/metrics.js';
import { logger } from '../utils/logger.js';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
}

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const status: HealthStatus = {
      status: 'healthy',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(status);
  } catch (err) {
    logger.error({ err }, 'Health check failed');
    res.status(503).json({ status: 'unhealthy', version: '1.0.0', uptime: process.uptime(), timestamp: new Date().toISOString() });
  }
});

router.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

router.get('/health/ready', async (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ready' });
});

router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const metrics = await getMetrics();
    res.set('Content-Type', getContentType());
    res.send(metrics);
  } catch (err) {
    logger.error({ err }, 'Failed to get metrics');
    res.status(500).send('Error collecting metrics');
  }
});

export default router;
