import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { query } from '../db/postgres.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, ConflictError } from '../middleware/errorHandler.js';
import type { CreateWebhook, UpdateWebhook, Webhook, WebhookDelivery } from '../types/index.js';

/**
 * Generate a webhook signing secret
 */
const generateSecret = (): string => {
  return `whsec_${crypto.randomBytes(32).toString('base64url')}`;
};

/**
 * Create HMAC signature for webhook payload
 */
export const signPayload = (payload: string, secret: string): string => {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
};

/**
 * Create a new webhook
 */
export const createWebhook = async (data: CreateWebhook): Promise<Webhook> => {
  const existing = await query<{ id: string }>(
    'SELECT id FROM webhooks WHERE tenant_id = $1 AND name = $2',
    [data.tenant_id, data.name]
  );

  if (existing.length > 0) {
    throw new ConflictError('Webhook with this name already exists');
  }

  const id = uuidv4();
  const secret = generateSecret();

  const webhooks = await query<Webhook>(
    `INSERT INTO webhooks (id, tenant_id, name, url, secret, events, is_active, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7, NOW(), NOW())
     RETURNING *`,
    [id, data.tenant_id, data.name, data.url, secret, data.events, data.metadata || {}]
  );

  logger.info({
    webhookId: id,
    tenantId: data.tenant_id,
    name: data.name,
    events: data.events,
  }, 'Webhook created');

  return webhooks[0];
};

/**
 * Get webhook by ID
 */
export const getWebhookById = async (
  webhookId: string,
  tenantId: string
): Promise<Webhook> => {
  const webhooks = await query<Webhook>(
    'SELECT * FROM webhooks WHERE id = $1 AND tenant_id = $2',
    [webhookId, tenantId]
  );

  if (webhooks.length === 0) {
    throw new NotFoundError('Webhook');
  }

  return webhooks[0];
};

/**
 * List webhooks for a tenant
 */
export const listWebhooks = async (
  tenantId: string,
  includeInactive: boolean = false
): Promise<Webhook[]> => {
  const whereClause = includeInactive
    ? 'WHERE tenant_id = $1'
    : 'WHERE tenant_id = $1 AND is_active = true';

  return query<Webhook>(
    `SELECT * FROM webhooks ${whereClause} ORDER BY created_at DESC`,
    [tenantId]
  );
};

/**
 * Update a webhook
 */
export const updateWebhook = async (
  webhookId: string,
  tenantId: string,
  data: UpdateWebhook
): Promise<Webhook> => {
  const existing = await getWebhookById(webhookId, tenantId);

  // Check name uniqueness if name is being changed
  if (data.name && data.name !== existing.name) {
    const nameCheck = await query<{ id: string }>(
      'SELECT id FROM webhooks WHERE tenant_id = $1 AND name = $2 AND id != $3',
      [tenantId, data.name, webhookId]
    );
    if (nameCheck.length > 0) {
      throw new ConflictError('Webhook with this name already exists');
    }
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.url !== undefined) {
    updates.push(`url = $${paramIndex++}`);
    values.push(data.url);
  }
  if (data.events !== undefined) {
    updates.push(`events = $${paramIndex++}`);
    values.push(data.events);
  }
  if (data.is_active !== undefined) {
    updates.push(`is_active = $${paramIndex++}`);
    values.push(data.is_active);
  }
  if (data.metadata !== undefined) {
    updates.push(`metadata = $${paramIndex++}`);
    values.push(data.metadata);
  }

  if (updates.length === 0) {
    return existing;
  }

  values.push(webhookId, tenantId);

  const result = await query<Webhook>(
    `UPDATE webhooks SET ${updates.join(', ')}
     WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
     RETURNING *`,
    values
  );

  logger.info({ webhookId, tenantId }, 'Webhook updated');

  return result[0];
};

/**
 * Delete a webhook
 */
export const deleteWebhook = async (
  webhookId: string,
  tenantId: string
): Promise<void> => {
  await getWebhookById(webhookId, tenantId); // throws NotFoundError

  await query(
    'DELETE FROM webhooks WHERE id = $1 AND tenant_id = $2',
    [webhookId, tenantId]
  );

  logger.info({ webhookId, tenantId }, 'Webhook deleted');
};

/**
 * Regenerate webhook secret
 */
export const rotateWebhookSecret = async (
  webhookId: string,
  tenantId: string
): Promise<Webhook> => {
  await getWebhookById(webhookId, tenantId); // throws NotFoundError

  const newSecret = generateSecret();

  const result = await query<Webhook>(
    'UPDATE webhooks SET secret = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *',
    [newSecret, webhookId, tenantId]
  );

  logger.info({ webhookId, tenantId }, 'Webhook secret rotated');

  return result[0];
};

/**
 * Test a webhook by sending a test payload
 */
export const testWebhook = async (
  webhookId: string,
  tenantId: string
): Promise<WebhookDelivery> => {
  const webhook = await getWebhookById(webhookId, tenantId);

  const payload = {
    event: 'webhook.test',
    tenant_id: tenantId,
    webhook_id: webhookId,
    timestamp: new Date().toISOString(),
    data: { message: 'This is a test webhook delivery' },
  };

  return deliverWebhook(webhook, 'webhook.test', payload);
};

/**
 * Deliver a webhook payload to the endpoint
 */
export const deliverWebhook = async (
  webhook: Webhook,
  eventType: string,
  payload: Record<string, unknown>
): Promise<WebhookDelivery> => {
  const deliveryId = uuidv4();
  const payloadStr = JSON.stringify(payload);
  const signature = signPayload(payloadStr, webhook.secret);

  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let status: 'success' | 'failed' = 'failed';

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Id': webhook.id,
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': eventType,
        'User-Agent': 'VoiceSaaS-Webhook/1.0',
      },
      body: payloadStr,
      signal: AbortSignal.timeout(10000),
    });

    responseStatus = response.status;
    responseBody = await response.text().catch(() => null);
    status = response.ok ? 'success' : 'failed';
  } catch (err) {
    responseBody = err instanceof Error ? err.message : 'Unknown error';
    logger.warn({ webhookId: webhook.id, error: responseBody }, 'Webhook delivery failed');
  }

  const deliveries = await query<WebhookDelivery>(
    `INSERT INTO webhook_deliveries
     (id, webhook_id, tenant_id, event_type, payload, response_status, response_body, attempts, status, delivered_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, NOW())
     RETURNING *`,
    [
      deliveryId, webhook.id, webhook.tenant_id, eventType,
      payload, responseStatus, responseBody, status,
      status === 'success' ? new Date() : null,
    ]
  );

  logger.info({
    deliveryId,
    webhookId: webhook.id,
    eventType,
    status,
    responseStatus,
  }, 'Webhook delivered');

  return deliveries[0];
};

/**
 * List deliveries for a webhook
 */
export const listDeliveries = async (
  webhookId: string,
  tenantId: string,
  limit: number = 20
): Promise<WebhookDelivery[]> => {
  await getWebhookById(webhookId, tenantId); // throws NotFoundError

  return query<WebhookDelivery>(
    `SELECT * FROM webhook_deliveries
     WHERE webhook_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [webhookId, tenantId, limit]
  );
};

/**
 * Dispatch event to all matching webhooks for a tenant
 */
export const dispatchEvent = async (
  tenantId: string,
  eventType: string,
  data: Record<string, unknown>
): Promise<void> => {
  const webhooks = await query<Webhook>(
    `SELECT * FROM webhooks
     WHERE tenant_id = $1 AND is_active = true AND $2 = ANY(events)`,
    [tenantId, eventType]
  );

  if (webhooks.length === 0) return;

  const payload = {
    event: eventType,
    tenant_id: tenantId,
    timestamp: new Date().toISOString(),
    data,
  };

  // Fire deliveries in parallel, don't block caller
  await Promise.allSettled(
    webhooks.map((webhook) => deliverWebhook(webhook, eventType, payload))
  );
};
