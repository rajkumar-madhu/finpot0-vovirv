import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { config } from '../config.js';
import { query } from '../db/postgres.js';
import { logger } from '../utils/logger.js';
import { activeApiKeys } from '../utils/metrics.js';
import { NotFoundError, ConflictError } from '../middleware/errorHandler.js';
import type { CreateApiKey, ApiKey } from '../types/index.js';

/**
 * Generate a secure API key
 * Format: vsk_<random32chars>
 */
const generateApiKey = (): { key: string; prefix: string } => {
  const randomBytes = crypto.randomBytes(24);
  const encoded = randomBytes.toString('base64url');
  const prefix = `vsk_${encoded.substring(0, 8)}`;
  const key = `${prefix}_${encoded.substring(8)}`;
  return { key, prefix };
};

/**
 * Create a new API key
 */
export const createApiKey = async (
  data: CreateApiKey
): Promise<{ apiKey: ApiKey; rawKey: string }> => {
  // Check if name already exists for this tenant
  const existing = await query<{ id: string }>(
    'SELECT id FROM api_keys WHERE tenant_id = $1 AND name = $2',
    [data.tenant_id, data.name]
  );

  if (existing.length > 0) {
    throw new ConflictError('API key with this name already exists');
  }

  const keyId = uuidv4();
  const { key: rawKey, prefix } = generateApiKey();
  const keyHash = await bcrypt.hash(rawKey, config.apiKeyHashRounds);

  const keys = await query<ApiKey>(
    `INSERT INTO api_keys (id, tenant_id, name, key_prefix, key_hash, scopes, is_active, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7, NOW())
     RETURNING id, tenant_id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at`,
    [keyId, data.tenant_id, data.name, prefix, keyHash, data.scopes, data.expires_at || null]
  );

  const apiKey = keys[0];

  // Get tenant plan for metrics
  const tenants = await query<{ plan: string }>(
    'SELECT plan FROM tenants WHERE id = $1',
    [data.tenant_id]
  );
  if (tenants.length > 0) {
    activeApiKeys.inc({ tenant_id: data.tenant_id, plan: tenants[0].plan });
  }

  logger.info({
    apiKeyId: apiKey.id,
    tenantId: apiKey.tenant_id,
    name: apiKey.name,
  }, 'API key created');

  return { apiKey, rawKey };
};

/**
 * Get API key by ID (without hash)
 */
export const getApiKeyById = async (
  keyId: string,
  tenantId: string
): Promise<ApiKey | null> => {
  const keys = await query<ApiKey>(
    `SELECT id, tenant_id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at
     FROM api_keys WHERE id = $1 AND tenant_id = $2`,
    [keyId, tenantId]
  );

  return keys[0] || null;
};

/**
 * List API keys for a tenant
 */
export const listApiKeys = async (
  tenantId: string,
  includeInactive: boolean = false
): Promise<ApiKey[]> => {
  const whereClause = includeInactive
    ? 'WHERE tenant_id = $1'
    : 'WHERE tenant_id = $1 AND is_active = true';

  const keys = await query<ApiKey>(
    `SELECT id, tenant_id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at
     FROM api_keys ${whereClause}
     ORDER BY created_at DESC`,
    [tenantId]
  );

  return keys;
};

/**
 * Revoke (deactivate) an API key
 */
export const revokeApiKey = async (keyId: string, tenantId: string): Promise<void> => {
  const key = await getApiKeyById(keyId, tenantId);
  if (!key) {
    throw new NotFoundError('API key');
  }

  await query(
    'UPDATE api_keys SET is_active = false WHERE id = $1 AND tenant_id = $2',
    [keyId, tenantId]
  );

  // Update metrics
  const tenants = await query<{ plan: string }>(
    'SELECT plan FROM tenants WHERE id = $1',
    [tenantId]
  );
  if (tenants.length > 0) {
    activeApiKeys.dec({ tenant_id: tenantId, plan: tenants[0].plan });
  }

  logger.info({ apiKeyId: keyId, tenantId }, 'API key revoked');
};

/**
 * Rotate an API key (create new, revoke old)
 */
export const rotateApiKey = async (
  keyId: string,
  tenantId: string
): Promise<{ apiKey: ApiKey; rawKey: string }> => {
  const existing = await getApiKeyById(keyId, tenantId);
  if (!existing) {
    throw new NotFoundError('API key');
  }

  // Create new key with same settings
  const result = await createApiKey({
    tenant_id: tenantId,
    name: `${existing.name} (rotated)`,
    scopes: existing.scopes,
    expires_at: existing.expires_at || undefined,
  });

  // Revoke old key
  await revokeApiKey(keyId, tenantId);

  logger.info({
    oldKeyId: keyId,
    newKeyId: result.apiKey.id,
    tenantId,
  }, 'API key rotated');

  return result;
};

/**
 * Update API key scopes
 */
export const updateApiKeyScopes = async (
  keyId: string,
  tenantId: string,
  scopes: string[]
): Promise<ApiKey> => {
  const existing = await getApiKeyById(keyId, tenantId);
  if (!existing) {
    throw new NotFoundError('API key');
  }

  await query(
    'UPDATE api_keys SET scopes = $1 WHERE id = $2 AND tenant_id = $3',
    [scopes, keyId, tenantId]
  );

  logger.info({ apiKeyId: keyId, tenantId, scopes }, 'API key scopes updated');

  return { ...existing, scopes };
};

/**
 * Delete expired API keys (cleanup job)
 */
export const cleanupExpiredKeys = async (): Promise<number> => {
  const result = await query<{ id: string; tenant_id: string }>(
    `DELETE FROM api_keys
     WHERE expires_at IS NOT NULL AND expires_at < NOW() AND is_active = true
     RETURNING id, tenant_id`,
    []
  );

  if (result.length > 0) {
    logger.info({ count: result.length }, 'Expired API keys cleaned up');
  }

  return result.length;
};
