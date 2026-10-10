import { z } from 'zod';

// Plan types
export const PlanSchema = z.enum(['free', 'pro', 'enterprise']);
export type Plan = z.infer<typeof PlanSchema>;

// Tenant schemas
export const CreateTenantSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  plan: PlanSchema.default('free'),
  settings: z.record(z.unknown()).optional(),
});

export const UpdateTenantSchema = CreateTenantSchema.partial();

export const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  plan: PlanSchema,
  settings: z.record(z.unknown()).nullable(),
  is_active: z.boolean(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type CreateTenant = z.infer<typeof CreateTenantSchema>;
export type UpdateTenant = z.infer<typeof UpdateTenantSchema>;
export type Tenant = z.infer<typeof TenantSchema>;

// User schemas
export const CreateUserSchema = z.object({
  tenant_id: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(2).max(100),
  role: z.enum(['admin', 'user', 'viewer']).default('user'),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  tenant_id: z.string().uuid().optional(),
});

export const UserSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['admin', 'user', 'viewer']),
  is_active: z.boolean(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type CreateUser = z.infer<typeof CreateUserSchema>;
export type Login = z.infer<typeof LoginSchema>;
export type User = z.infer<typeof UserSchema>;

// API Key schemas
export const CreateApiKeySchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().min(2).max(100),
  scopes: z.array(z.string()).default(['read', 'write']),
  expires_at: z.date().optional(),
});

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string(),
  key_prefix: z.string(),
  key_hash: z.string(),
  scopes: z.array(z.string()),
  is_active: z.boolean(),
  last_used_at: z.date().nullable(),
  expires_at: z.date().nullable(),
  created_at: z.date(),
});

export type CreateApiKey = z.infer<typeof CreateApiKeySchema>;
export type ApiKey = z.infer<typeof ApiKeySchema>;

// JWT payload
export interface JwtPayload {
  sub: string; // user_id
  tenant_id: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

// Request context
export interface RequestContext {
  tenant_id: string;
  user_id?: string;
  api_key_id?: string;
  scopes?: string[];
}

// Express extensions
declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
      startTime?: number;
    }
  }
}

// Usage metrics
export const UsageEventSchema = z.object({
  tenant_id: z.string().uuid(),
  event_type: z.enum([
    'api_call',
    'stt_seconds',
    'tts_chars',
    'llm_tokens',
    'call_minutes',
  ]),
  value: z.number().positive(),
  metadata: z.record(z.unknown()).optional(),
});

export type UsageEvent = z.infer<typeof UsageEventSchema>;

// Webhook schemas
export const WebhookEventTypes = [
  'call.started',
  'call.completed',
  'call.failed',
  'stt.completed',
  'tts.completed',
  'agent.created',
  'agent.updated',
  'tenant.updated',
] as const;

export const CreateWebhookSchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().min(2).max(100),
  url: z.string().url().max(2048),
  events: z.array(z.enum(WebhookEventTypes)).min(1),
  metadata: z.record(z.unknown()).optional(),
});

export const UpdateWebhookSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  url: z.string().url().max(2048).optional(),
  events: z.array(z.enum(WebhookEventTypes)).min(1).optional(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const WebhookSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string(),
  url: z.string(),
  secret: z.string(),
  events: z.array(z.string()),
  is_active: z.boolean(),
  metadata: z.record(z.unknown()).nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const WebhookDeliverySchema = z.object({
  id: z.string().uuid(),
  webhook_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  event_type: z.string(),
  payload: z.record(z.unknown()),
  response_status: z.number().nullable(),
  response_body: z.string().nullable(),
  attempts: z.number(),
  max_attempts: z.number(),
  status: z.enum(['pending', 'success', 'failed']),
  next_retry_at: z.date().nullable(),
  delivered_at: z.date().nullable(),
  created_at: z.date(),
});

export type CreateWebhook = z.infer<typeof CreateWebhookSchema>;
export type UpdateWebhook = z.infer<typeof UpdateWebhookSchema>;
export type Webhook = z.infer<typeof WebhookSchema>;
export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;

// Rate limit config per plan
export const RATE_LIMITS: Record<Plan, number> = {
  free: 60,
  pro: 300,
  enterprise: 1000,
};
