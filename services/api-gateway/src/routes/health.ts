import { Router, Request, Response } from 'express';
import { checkServicesHealth } from '../services/proxyService.js';
import { getMetrics, getContentType } from '../utils/metrics.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /health
 * Gateway health check
 */
router.get('/health', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const services = await checkServicesHealth();
    const allHealthy = Object.values(services).every((s) => s.healthy);

    const status = {
      status: allHealthy ? 'healthy' : 'degraded',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services,
    };

    logger.debug({
      duration: Date.now() - startTime,
      status: status.status,
    }, 'Health check completed');

    res.status(allHealthy ? 200 : 503).json(status);
  } catch (err) {
    logger.error({ err }, 'Health check failed');
    res.status(503).json({
      status: 'unhealthy',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

/**
 * GET /health/live
 * Liveness probe
 */
router.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

/**
 * GET /health/ready
 * Readiness probe
 */
router.get('/health/ready', async (_req: Request, res: Response) => {
  try {
    const services = await checkServicesHealth();

    // Gateway is ready if at least auth service is healthy
    const authHealthy = services.auth?.healthy;

    if (authHealthy) {
      res.status(200).json({ status: 'ready' });
    } else {
      res.status(503).json({
        status: 'not ready',
        reason: 'Auth service unavailable',
      });
    }
  } catch {
    res.status(503).json({ status: 'not ready' });
  }
});

/**
 * GET /metrics
 * Prometheus metrics
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
