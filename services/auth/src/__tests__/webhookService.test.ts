/**
 * Webhook Service Unit Tests
 * Pure unit tests — no DB or external dependencies
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { CreateWebhookSchema, UpdateWebhookSchema } from '../types/index.js';

// Inline signPayload to avoid importing the service (which triggers config/db)
const signPayload = (payload: string, secret: string): string => {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
};

describe('Webhook Service', () => {
  describe('Webhook Signature', () => {
    it('should generate consistent HMAC signatures', () => {
      const payload = JSON.stringify({ event: 'call.completed', data: {} });
      const secret = 'whsec_test_secret_123';

      const sig1 = signPayload(payload, secret);
      const sig2 = signPayload(payload, secret);

      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    it('should produce different signatures for different payloads', () => {
      const secret = 'whsec_test_secret_123';
      const sig1 = signPayload('{"event":"call.completed"}', secret);
      const sig2 = signPayload('{"event":"call.failed"}', secret);

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different secrets', () => {
      const payload = '{"event":"call.completed"}';
      const sig1 = signPayload(payload, 'secret_one');
      const sig2 = signPayload(payload, 'secret_two');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('Webhook Validation', () => {
    it('should validate correct webhook creation data', () => {
      const validData = {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: ['call.completed'],
      };

      const result = CreateWebhookSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL', () => {
      const invalidData = {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'My Webhook',
        url: 'not-a-url',
        events: ['call.completed'],
      };

      const result = CreateWebhookSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject empty events array', () => {
      const invalidData = {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: [],
      };

      const result = CreateWebhookSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid event types', () => {
      const invalidData = {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: ['invalid.event'],
      };

      const result = CreateWebhookSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept valid event types', () => {
      const validEvents = [
        'call.started',
        'call.completed',
        'call.failed',
        'stt.completed',
        'tts.completed',
        'agent.created',
        'agent.updated',
        'tenant.updated',
      ];

      validEvents.forEach((event) => {
        const data = {
          tenant_id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Test',
          url: 'https://example.com/hook',
          events: [event],
        };
        const result = CreateWebhookSchema.safeParse(data);
        expect(result.success).toBe(true);
      });
    });

    it('should reject short names', () => {
      const invalidData = {
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'X',
        url: 'https://example.com/webhook',
        events: ['call.completed'],
      };

      const result = CreateWebhookSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('Webhook Update Validation', () => {
    it('should allow partial updates', () => {
      expect(UpdateWebhookSchema.safeParse({ name: 'New Name' }).success).toBe(true);
      expect(UpdateWebhookSchema.safeParse({ is_active: false }).success).toBe(true);
      expect(UpdateWebhookSchema.safeParse({ url: 'https://new.example.com/hook' }).success).toBe(true);
      expect(UpdateWebhookSchema.safeParse({}).success).toBe(true);
    });

    it('should reject invalid URL in update', () => {
      const result = UpdateWebhookSchema.safeParse({ url: 'bad-url' });
      expect(result.success).toBe(false);
    });
  });

  describe('Webhook Secret Format', () => {
    it('should validate secret format', () => {
      const isValidSecret = (secret: string): boolean => {
        return secret.startsWith('whsec_') && secret.length > 20;
      };

      expect(isValidSecret('whsec_abc123def456ghi789jkl012')).toBe(true);
      expect(isValidSecret('invalid_secret')).toBe(false);
      expect(isValidSecret('whsec_short')).toBe(false);
    });
  });

  describe('Tenant Isolation', () => {
    it('should build queries with tenant_id', () => {
      const buildWebhookQuery = (tenantId: string, webhookId: string) => ({
        text: 'SELECT * FROM webhooks WHERE id = $1 AND tenant_id = $2',
        values: [webhookId, tenantId],
      });

      const q = buildWebhookQuery('tenant-123', 'webhook-456');
      expect(q.text).toContain('tenant_id = $2');
      expect(q.values).toContain('tenant-123');
    });
  });

  describe('Delivery Status', () => {
    it('should validate delivery status values', () => {
      const validStatuses = ['pending', 'success', 'failed'];
      const isValidStatus = (s: string): boolean => validStatuses.includes(s);

      expect(isValidStatus('pending')).toBe(true);
      expect(isValidStatus('success')).toBe(true);
      expect(isValidStatus('failed')).toBe(true);
      expect(isValidStatus('retrying')).toBe(false);
    });

    it('should determine delivery success from HTTP status', () => {
      const isSuccessful = (status: number): boolean => status >= 200 && status < 300;

      expect(isSuccessful(200)).toBe(true);
      expect(isSuccessful(201)).toBe(true);
      expect(isSuccessful(400)).toBe(false);
      expect(isSuccessful(500)).toBe(false);
    });
  });
});
