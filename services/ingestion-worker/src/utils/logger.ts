import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.logLevel,
  formatters: {
    level: (label) => ({ level: label }),
    bindings: () => ({}),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'ingestion-worker',
    env: config.nodeEnv,
  },
});
