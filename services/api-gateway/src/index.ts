import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { httpRequestsTotal, httpRequestDuration, activeConnections } from './utils/metrics.js';

// Routes
import healthRoutes from './routes/health.js';
import voiceRoutes from './routes/voice.js';
import twilioRoutes from './routes/twilio.js';

const app = express();

// Track active connections
app.use((_req: Request, res: Response, next: NextFunction) => {
  activeConnections.inc();
  res.on('finish', () => activeConnections.dec());
  next();
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.nodeEnv === 'production'
    ? config.allowedOrigins.split(',').filter(Boolean)
    : '*',
  credentials: true,
}));

// Request parsing
app.use(express.json({ limit: '50mb' })); // Large for audio
app.use(express.urlencoded({ extended: true }));

// Request ID
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

// Request logging
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

// Request timing
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
        service: 'gateway',
      });
      httpRequestDuration.observe(
        { method: req.method, path, status: res.statusCode, service: 'gateway' },
        duration
      );
    }
  });

  next();
});

// Routes
app.use('/', healthRoutes);
app.use('/v1/voice', voiceRoutes);
app.use('/twilio', twilioRoutes);  // Twilio webhooks (no auth - uses signature validation)

// Proxy auth routes
app.use('/auth', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { proxyRequest } = await import('./services/proxyService.js');
    const result = await proxyRequest({
      service: 'auth',
      method: req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: req.path,
      data: req.body,
      params: req.query as Record<string, string>,
      headers: {
        'Authorization': req.headers.authorization || '',
        'X-API-Key': req.headers['x-api-key'] as string || '',
        'X-Request-ID': req.headers['x-request-id'] as string,
      },
    });
    res.status(result.status).json(result.data);
  } catch (err) {
    next(err);
  }
});

// Proxy tenant routes
app.use('/tenants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { proxyRequest } = await import('./services/proxyService.js');
    const result = await proxyRequest({
      service: 'auth',
      method: req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: `/tenants${req.path}`,
      data: req.body,
      params: req.query as Record<string, string>,
      headers: {
        'Authorization': req.headers.authorization || '',
        'X-API-Key': req.headers['x-api-key'] as string || '',
        'X-Request-ID': req.headers['x-request-id'] as string,
      },
    });
    res.status(result.status).json(result.data);
  } catch (err) {
    next(err);
  }
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown
const shutdown = (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
app.listen(config.port, () => {
  logger.info({
    port: config.port,
    env: config.nodeEnv,
  }, 'API Gateway started');
});

export default app;
