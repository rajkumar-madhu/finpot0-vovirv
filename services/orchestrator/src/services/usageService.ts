import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface UsageEvent {
  tenantId: string;
  eventType: string;
  value: number;
  metadata?: Record<string, unknown>;
}

// Returns void (not Promise<void>) to make fire-and-forget explicit at the call site.
// Callers must NOT await this — usage recording must never block a voice response.
export function recordUsage(events: UsageEvent[]): void {
  const valid = events.filter(
    (e) => e.tenantId && e.tenantId !== 'unknown' && e.value > 0
  );
  if (valid.length === 0) return;

  const log = logger.child({ service: 'usage' });

  fetch(`${config.authUrl}/internal/usage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.internalServiceKey
        ? { Authorization: `Bearer ${config.internalServiceKey}` }
        : {}),
    },
    body: JSON.stringify({ events: valid }),
  }).catch((err) => {
    log.warn({ err, eventCount: valid.length }, 'usage_record_failed');
  });
}
