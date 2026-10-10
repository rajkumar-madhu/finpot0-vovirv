import { v4 as uuidv4 } from 'uuid';
import { query, transaction } from '../db/postgres.js';
import { logger } from '../utils/logger.js';
import { tenantsTotal } from '../utils/metrics.js';
import { NotFoundError, ConflictError } from '../middleware/errorHandler.js';
import type { CreateTenant, UpdateTenant, Tenant } from '../types/index.js';

/**
 * Create a new tenant
 */
export const createTenant = async (data: CreateTenant): Promise<Tenant> => {
  // Check if email already exists
  const existing = await query<{ id: string }>(
    'SELECT id FROM tenants WHERE email = $1',
    [data.email]
  );

  if (existing.length > 0) {
    throw new ConflictError('Tenant with this email already exists');
  }

  const tenantId = uuidv4();

  const tenants = await query<Tenant>(
    `INSERT INTO tenants (id, name, email, plan, settings, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
     RETURNING *`,
    [tenantId, data.name, data.email, data.plan, JSON.stringify(data.settings || {})]
  );

  const tenant = tenants[0];

  // Update metrics
  tenantsTotal.inc({ plan: tenant.plan, status: 'active' });

  logger.info({ tenantId: tenant.id, plan: tenant.plan }, 'Tenant created');

  return tenant;
};

/**
 * Get tenant by ID
 */
export const getTenantById = async (tenantId: string): Promise<Tenant | null> => {
  const tenants = await query<Tenant>(
    'SELECT * FROM tenants WHERE id = $1',
    [tenantId]
  );

  return tenants[0] || null;
};

/**
 * Update tenant
 */
export const updateTenant = async (
  tenantId: string,
  data: UpdateTenant
): Promise<Tenant> => {
  const existing = await getTenantById(tenantId);
  if (!existing) {
    throw new NotFoundError('Tenant');
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.email !== undefined) {
    updates.push(`email = $${paramIndex++}`);
    values.push(data.email);
  }
  if (data.plan !== undefined) {
    updates.push(`plan = $${paramIndex++}`);
    values.push(data.plan);
  }
  if (data.settings !== undefined) {
    updates.push(`settings = $${paramIndex++}`);
    values.push(JSON.stringify(data.settings));
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push(`updated_at = NOW()`);
  values.push(tenantId);

  const tenants = await query<Tenant>(
    `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  logger.info({ tenantId }, 'Tenant updated');

  return tenants[0];
};

/**
 * Deactivate tenant (soft delete)
 */
export const deactivateTenant = async (tenantId: string): Promise<void> => {
  const existing = await getTenantById(tenantId);
  if (!existing) {
    throw new NotFoundError('Tenant');
  }

  await query(
    'UPDATE tenants SET is_active = false, updated_at = NOW() WHERE id = $1',
    [tenantId]
  );

  // Update metrics
  tenantsTotal.dec({ plan: existing.plan, status: 'active' });
  tenantsTotal.inc({ plan: existing.plan, status: 'inactive' });

  logger.info({ tenantId }, 'Tenant deactivated');
};

/**
 * Activate tenant
 */
export const activateTenant = async (tenantId: string): Promise<void> => {
  const existing = await getTenantById(tenantId);
  if (!existing) {
    throw new NotFoundError('Tenant');
  }

  await query(
    'UPDATE tenants SET is_active = true, updated_at = NOW() WHERE id = $1',
    [tenantId]
  );

  // Update metrics
  tenantsTotal.dec({ plan: existing.plan, status: 'inactive' });
  tenantsTotal.inc({ plan: existing.plan, status: 'active' });

  logger.info({ tenantId }, 'Tenant activated');
};

/**
 * List all tenants (admin only)
 */
export const listTenants = async (
  limit: number = 50,
  offset: number = 0,
  includeInactive: boolean = false
): Promise<{ tenants: Tenant[]; total: number }> => {
  const whereClause = includeInactive ? '' : 'WHERE is_active = true';

  const [tenants, countResult] = await Promise.all([
    query<Tenant>(
      `SELECT * FROM tenants ${whereClause}
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tenants ${whereClause}`,
      []
    ),
  ]);

  return {
    tenants,
    total: parseInt(countResult[0].count, 10),
  };
};

/**
 * Get tenant settings
 */
export const getTenantSettings = async (
  tenantId: string
): Promise<Record<string, unknown>> => {
  const tenants = await query<{ settings: Record<string, unknown> }>(
    'SELECT settings FROM tenants WHERE id = $1',
    [tenantId]
  );

  if (tenants.length === 0) {
    throw new NotFoundError('Tenant');
  }

  return tenants[0].settings || {};
};

/**
 * Update tenant settings (merge)
 */
export const updateTenantSettings = async (
  tenantId: string,
  settings: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const current = await getTenantSettings(tenantId);
  const merged = { ...current, ...settings };

  await query(
    'UPDATE tenants SET settings = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(merged), tenantId]
  );

  logger.info({ tenantId }, 'Tenant settings updated');

  return merged;
};

/**
 * Record usage events in batch (called by internal service-to-service API)
 */
export const recordUsageEvents = async (
  events: Array<{
    tenantId: string;
    eventType: string;
    value: number;
    metadata?: Record<string, unknown>;
  }>
): Promise<void> => {
  if (events.length === 0) return;

  const params: unknown[] = [];
  const placeholders: string[] = [];

  events.forEach((e, i) => {
    const base = i * 4;
    params.push(e.tenantId, e.eventType, e.value, JSON.stringify(e.metadata ?? {}));
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
  });

  await query(
    `INSERT INTO usage_events (tenant_id, event_type, value, metadata)
     VALUES ${placeholders.join(', ')}`,
    params
  );

  logger.debug({ count: events.length }, 'usage_events_recorded');
};

/**
 * Get tenant usage summary
 */
export const getTenantUsage = async (
  tenantId: string,
  startDate?: Date,
  endDate?: Date
): Promise<Record<string, number>> => {
  const start = startDate || new Date(new Date().setDate(1)); // First of month
  const end = endDate || new Date();

  const usage = await query<{ event_type: string; total: string }>(
    `SELECT event_type, SUM(value) as total
     FROM usage_events
     WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
     GROUP BY event_type`,
    [tenantId, start, end]
  );

  return usage.reduce(
    (acc, row) => ({
      ...acc,
      [row.event_type]: parseFloat(row.total),
    }),
    {}
  );
};
