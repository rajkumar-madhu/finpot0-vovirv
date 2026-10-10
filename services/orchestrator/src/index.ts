import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { httpRequestsTotal, httpRequestDuration, activeConnections } from './utils/metrics.js';
import { closeRedis } from './db/redis.js';

import healthRoutes from './routes/health.js';
import voiceRoutes from './routes/voice.js';
import chatRoutes from './routes/chat.js';
import ingestionRoutes from './routes/ingestion.js';

const app = express();

app.use((_req: Request, res: Response, next: NextFunction) => {
  activeConnections.labels('http').inc();
  res.on('finish', () => activeConnections.labels('http').dec());
  next();
});

app.use(helmet());
app.use(cors({
  origin: config.nodeEnv === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean)
    : '*',
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url?.startsWith('/health') || req.url === '/metrics',
  },
  customProps: (req) => ({
    tenantId: (req as Request).context?.tenant_id,
    requestId: req.headers['x-request-id'],
  }),
}));

app.use((req: Request, res: Response, next: NextFunction) => {
  req.startTime = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - (req.startTime || Date.now())) / 1000;
    const path = req.route?.path || req.path;

    if (!path.startsWith('/health') && path !== '/metrics') {
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

app.use('/', healthRoutes);
app.use('/v1', voiceRoutes);
app.use('/v1', chatRoutes);
app.use('/v1', ingestionRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received');
  await closeRedis();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

app.listen(config.port, () => {
  logger.info({
    port: config.port,
    env: config.nodeEnv,
  }, 'Orchestrator service started');
});

export default app;
