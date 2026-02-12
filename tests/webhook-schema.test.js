/**
 * Unit tests: Webhook request parsing and validation
 *
 * Tests the Zod-based webhook request parser — verifies it correctly accepts
 * valid form submissions and rejects missing/invalid fields (name, email, company).
 * Also tests the validation error formatter.
 *
 * Run from project root:
 *   pnpm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseWebhookRequest, formatValidationErrors } from '../dist/schemas/webhook.js';

describe('parseWebhookRequest', () => {
  it('should accept valid complete request', () => {
    const body = {
      name: 'Anna Svensson',
      email: 'anna@company.se',
      phone: '+46 70 123 4567',
      company: 'Tech Company AB',
      industry: 'Technology',
      service_type: 'Recruitment',
      message: 'We need developers',
      subject: 'Hiring inquiry',
    };

    const result = parseWebhookRequest(body);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data, body);
  });

  it('should accept minimal valid request', () => {
    const body = {
      name: 'Test',
      email: 'test@test.com',
      company: 'ABC',
    };

    const result = parseWebhookRequest(body);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.name, 'Test');
    assert.strictEqual(result.data.email, 'test@test.com');
    assert.strictEqual(result.data.company, 'ABC');
  });

  it('should reject missing name', () => {
    const body = {
      email: 'test@test.com',
      company: 'ABC',
    };

    const result = parseWebhookRequest(body);

    assert.strictEqual(result.success, false);
    assert.ok(result.errors.errors.some(e => e.path.includes('name')));
  });

  it('should reject missing email', () => {
    const body = {
      name: 'Test',
      company: 'ABC',
    };

    const result = parseWebhookRequest(body);

    assert.strictEqual(result.success, false);
    assert.ok(result.errors.errors.some(e => e.path.includes('email')));
  });

  it('should reject invalid email format', () => {
    const body = {
      name: 'Test',
      email: 'not-an-email',
      company: 'ABC',
    };

    const result = parseWebhookRequest(body);

    assert.strictEqual(result.success, false);
    assert.ok(result.errors.errors.some(e => e.message.toLowerCase().includes('email')));
  });

  it('should reject missing company', () => {
    const body = {
      name: 'Test',
      email: 'test@test.com',
    };

    const result = parseWebhookRequest(body);

    assert.strictEqual(result.success, false);
    assert.ok(result.errors.errors.some(e => e.path.includes('company')));
  });

  it('should reject empty name', () => {
    const body = {
      name: '',
      email: 'test@test.com',
      company: 'ABC',
    };

    const result = parseWebhookRequest(body);

    assert.strictEqual(result.success, false);
  });

  it('should reject empty company', () => {
    const body = {
      name: 'Test',
      email: 'test@test.com',
      company: '',
    };

    const result = parseWebhookRequest(body);

    assert.strictEqual(result.success, false);
  });

  it('should handle null body', () => {
    const result = parseWebhookRequest(null);

    assert.strictEqual(result.success, false);
  });

  it('should handle undefined body', () => {
    const result = parseWebhookRequest(undefined);

    assert.strictEqual(result.success, false);
  });
});

describe('formatValidationErrors', () => {
  it('should format single error', () => {
    const body = {
      name: 'Test',
      company: 'ABC',
    };

    const result = parseWebhookRequest(body);
    assert.strictEqual(result.success, false);

    const formatted = formatValidationErrors(result.errors);
    assert.ok(formatted.includes('email'));
  });

  it('should format multiple errors', () => {
    const body = {};

    const result = parseWebhookRequest(body);
    assert.strictEqual(result.success, false);

    const formatted = formatValidationErrors(result.errors);
    assert.ok(formatted.includes('name'));
    assert.ok(formatted.includes('email'));
    assert.ok(formatted.includes('company'));
  });
});
