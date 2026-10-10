import { Router, Request, Response } from 'express';
import { checkConnection } from '../db/postgres.js';
import { checkRedisConnection } from '../db/redis.js';
import { getMetrics, getContentType } from '../utils/metrics.js';
import { logger } from '../utils/logger.js';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    database: boolean;
    redis: boolean;
  };
}

/**
 * GET /health
 * Health check endpoint for K8s probes
 */
router.get('/health', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const [dbHealthy, redisHealthy] = await Promise.all([
      checkConnection(),
      checkRedisConnection(),
    ]);

    const status: HealthStatus = {
      status: dbHealthy && redisHealthy ? 'healthy' : 'degraded',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealthy,
        redis: redisHealthy,
      },
    };

    const statusCode = status.status === 'healthy' ? 200 : 503;

    logger.debug({
      duration: Date.now() - startTime,
      status: status.status,
    }, 'Health check completed');

    res.status(statusCode).json(status);
  } catch (err) {
    logger.error({ err }, 'Health check failed');

    res.status(503).json({
      status: 'unhealthy',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: {
        database: false,
        redis: false,
      },
    });
  }
});

/**
 * GET /health/live
 * Liveness probe - is the process running?
 */
router.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

/**
 * GET /health/ready
 * Readiness probe - can the service handle requests?
 */
router.get('/health/ready', async (_req: Request, res: Response) => {
  try {
    const [dbHealthy, redisHealthy] = await Promise.all([
      checkConnection(),
      checkRedisConnection(),
    ]);

    if (dbHealthy && redisHealthy) {
      res.status(200).json({ status: 'ready' });
    } else {
      res.status(503).json({
        status: 'not ready',
        database: dbHealthy,
        redis: redisHealthy,
      });
    }
  } catch {
    res.status(503).json({ status: 'not ready' });
  }
});

/**
 * GET /metrics
 * Prometheus metrics endpoint
 */
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
