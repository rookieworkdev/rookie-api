/**
 * Unit tests: Lead validation and domain extraction
 *
 * Tests the validateLead() utility (scoring completeness, spam detection)
 * and extractDomain() (corporate email parsing, personal email filtering,
 * Swedish company name suffix stripping like AB/Aktiebolag).
 *
 * Run from project root:
 *   pnpm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateLead, extractDomain } from '../dist/utils/validator.js';

describe('validateLead', () => {
  it('should return high score for complete valid lead', () => {
    const lead = {
      full_name: 'Anna Svensson',
      email: 'anna@techcompany.se',
      phone: '+46 70 123 4567',
      company_name: 'Tech Company AB',
      needs_description: 'Vi behöver en junior utvecklare med erfarenhet av React och Node.js för vårt växande team.',
    };

    const result = validateLead(lead);

    assert.strictEqual(result.validation_score, 100);
    assert.strictEqual(result.is_likely_spam, false);
    assert.strictEqual(result.validation_details.email_valid, true);
    assert.strictEqual(result.validation_details.phone_valid, true);
    assert.strictEqual(result.validation_details.company_filled, true);
    assert.strictEqual(result.validation_details.needs_adequate, true);
  });

  it('should return lower score for incomplete lead', () => {
    const lead = {
      full_name: 'Bo',
      email: 'invalid-email',
      phone: '123',
      company_name: 'AB',
      needs_description: 'Short',
    };

    const result = validateLead(lead);

    assert.ok(result.validation_score < 50);
    assert.strictEqual(result.validation_details.email_valid, false);
    assert.strictEqual(result.validation_details.phone_valid, false);
    assert.strictEqual(result.validation_details.company_filled, false);
    assert.strictEqual(result.validation_details.needs_adequate, false);
  });

  it('should detect spam with multiple indicators', () => {
    const lead = {
      full_name: 'Spammer',
      email: 'spam@fake.com',
      phone: '+46 70 123 4567',
      company_name: 'Legit Company',
      needs_description: 'Buy viagra now! Click here for limited offer http://spam.com',
    };

    const result = validateLead(lead);

    assert.strictEqual(result.is_likely_spam, true);
  });

  it('should not flag as spam with single indicator', () => {
    const lead = {
      full_name: 'Erik Johansson',
      email: 'erik@company.se',
      phone: '+46 70 123 4567',
      company_name: 'Company AB',
      needs_description: 'We need help with our casino software development project for compliance.',
    };

    const result = validateLead(lead);

    assert.strictEqual(result.is_likely_spam, false);
  });

  it('should handle missing optional fields', () => {
    const lead = {
      full_name: 'Test User',
      email: 'test@company.se',
      company_name: 'Test Company',
    };

    const result = validateLead(lead);

    assert.ok(result.validation_score >= 0);
    assert.strictEqual(result.is_likely_spam, false);
  });
});

describe('extractDomain', () => {
  it('should extract domain from corporate email', () => {
    const data = {
      email: 'anna@techcompany.se',
      company_name: 'Tech Company AB',
    };

    const result = extractDomain(data);

    assert.strictEqual(result.extracted_domain, 'techcompany.se');
    assert.strictEqual(result.domain_source, 'email');
  });

  it('should skip personal email domains and guess from company', () => {
    const data = {
      email: 'anna@gmail.com',
      company_name: 'Tech Company AB',
    };

    const result = extractDomain(data);

    assert.strictEqual(result.extracted_domain, 'techcompany.se');
    assert.strictEqual(result.domain_source, 'guessed');
  });

  it('should skip hotmail.se as personal domain', () => {
    const data = {
      email: 'user@hotmail.se',
      company_name: 'Acme AB',
    };

    const result = extractDomain(data);

    assert.strictEqual(result.domain_source, 'guessed');
    assert.strictEqual(result.extracted_domain, 'acme.se');
  });

  it('should strip AB suffix when guessing domain', () => {
    const data = {
      email: 'user@outlook.com',
      company_name: 'Nordea AB',
    };

    const result = extractDomain(data);

    assert.strictEqual(result.extracted_domain, 'nordea.se');
    assert.strictEqual(result.domain_source, 'guessed');
  });

  it('should strip Aktiebolag suffix when guessing domain', () => {
    const data = {
      email: 'user@icloud.com',
      company_name: 'Volvo Aktiebolag',
    };

    const result = extractDomain(data);

    assert.strictEqual(result.extracted_domain, 'volvo.se');
    assert.strictEqual(result.domain_source, 'guessed');
  });

  it('should return none when no email or company', () => {
    const data = {};

    const result = extractDomain(data);

    assert.strictEqual(result.extracted_domain, null);
    assert.strictEqual(result.domain_source, 'none');
  });
});
