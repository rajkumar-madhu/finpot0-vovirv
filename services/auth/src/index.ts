import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { closePool } from './db/postgres.js';
import { closeRedis, getRedisClient } from './db/redis.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { httpRequestsTotal, httpRequestDuration } from './utils/metrics.js';

// Routes
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import tenantRoutes from './routes/tenants.js';
import userRoutes from './routes/users.js';
import apiKeyRoutes from './routes/apiKeys.js';
import webhookRoutes from './routes/webhooks.js';
import internalRoutes from './routes/internal.js';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.nodeEnv === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',') || []
    : '*',
  credentials: true,
}));

// Request parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/metrics',
  },
  customProps: (req) => ({
    tenantId: (req as Request).context?.tenant_id,
  }),
}));

// Request timing and metrics
app.use((req: Request, res: Response, next: NextFunction) => {
  req.startTime = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - (req.startTime || Date.now())) / 1000;
    const path = req.route?.path || req.path;

    // Skip health and metrics endpoints in metrics
    if (path !== '/health' && path !== '/metrics') {
      httpRequestsTotal.inc({
        method: req.method,
        path,
        status: res.statusCode,
      });
      httpRequestDuration.observe(
        { method: req.method, path, status: res.statusCode },
        duration
      );
    }
  });

  next();
});

// Request ID
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string ||
    `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

// Routes
app.use('/', healthRoutes);
app.use('/auth', authRoutes);
app.use('/tenants', tenantRoutes);
app.use('/users', userRoutes);
app.use('/api-keys', apiKeyRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/internal', internalRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received');

  // Close connections
  await Promise.all([
    closePool(),
    closeRedis(),
  ]);

  logger.info('Graceful shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
const start = async () => {
  try {
    // Initialize Redis connection
    await getRedisClient();

    app.listen(config.port, () => {
      logger.info({
        port: config.port,
        env: config.nodeEnv,
      }, 'Auth service started');
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
};

start();

export default app;
