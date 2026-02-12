/**
 * Unit tests: AI response schema validation
 *
 * Tests that the Zod schemas for AI scoring responses (lead classification)
 * and AI-generated job ads correctly accept valid data and reject invalid data.
 * Also tests markdown code block stripping from AI responses.
 *
 * Run from project root:
 *   pnpm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';

// Recreate the AI response schemas to test validation logic
// These must match the schemas in src/services/aiService.ts
const AIScoreResultSchema = z.object({
  lead_score: z.number().min(1).max(100),
  role_category: z.string(),
  classification: z.enum(['valid_lead', 'invalid_lead', 'likely_candidate', 'likely_spam']),
  key_requirements: z.array(z.string()),
  ai_reasoning: z.string(),
});

const JobAdDataSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  description: z.string().min(1),
  location: z.string().min(1),
  category: z.string().min(1),
  external_url: z.string().url(),
  posted_date: z.string(),
});

describe('AIScoreResultSchema', () => {
  it('should accept valid lead response', () => {
    const response = {
      lead_score: 85,
      role_category: 'Software Development',
      classification: 'valid_lead',
      key_requirements: ['React experience', '3+ years', 'Swedish fluency'],
      ai_reasoning: 'Company is seeking a frontend developer, clear professional need.',
    };

    const result = AIScoreResultSchema.safeParse(response);
    assert.strictEqual(result.success, true);
  });

  it('should accept invalid_lead classification', () => {
    const response = {
      lead_score: 20,
      role_category: 'Healthcare',
      classification: 'invalid_lead',
      key_requirements: [],
      ai_reasoning: 'Looking for nurses, outside Rookie scope.',
    };

    const result = AIScoreResultSchema.safeParse(response);
    assert.strictEqual(result.success, true);
  });

  it('should accept likely_candidate classification', () => {
    const response = {
      lead_score: 1,
      role_category: 'Job Seeker',
      classification: 'likely_candidate',
      key_requirements: [],
      ai_reasoning: 'Personal email, describing own skills and looking for work.',
    };

    const result = AIScoreResultSchema.safeParse(response);
    assert.strictEqual(result.success, true);
  });

  it('should accept likely_spam classification', () => {
    const response = {
      lead_score: 1,
      role_category: 'Unknown',
      classification: 'likely_spam',
      key_requirements: [],
      ai_reasoning: 'Incoherent message with promotional content.',
    };

    const result = AIScoreResultSchema.safeParse(response);
    assert.strictEqual(result.success, true);
  });

  it('should reject invalid classification value', () => {
    const response = {
      lead_score: 50,
      role_category: 'Tech',
      classification: 'maybe_valid',
      key_requirements: [],
      ai_reasoning: 'Not sure',
    };

    const result = AIScoreResultSchema.safeParse(response);
    assert.strictEqual(result.success, false);
  });

  it('should reject lead_score below 1', () => {
    const response = {
      lead_score: 0,
      role_category: 'Tech',
      classification: 'valid_lead',
      key_requirements: [],
      ai_reasoning: 'Test',
    };

    const result = AIScoreResultSchema.safeParse(response);
    assert.strictEqual(result.success, false);
  });

  it('should reject lead_score above 100', () => {
    const response = {
      lead_score: 101,
      role_category: 'Tech',
      classification: 'valid_lead',
      key_requirements: [],
      ai_reasoning: 'Test',
    };

    const result = AIScoreResultSchema.safeParse(response);
    assert.strictEqual(result.success, false);
  });

  it('should reject missing required fields', () => {
    const response = {
      lead_score: 50,
      classification: 'valid_lead',
    };

    const result = AIScoreResultSchema.safeParse(response);
    assert.strictEqual(result.success, false);
  });

  it('should reject non-array key_requirements', () => {
    const response = {
      lead_score: 50,
      role_category: 'Tech',
      classification: 'valid_lead',
      key_requirements: 'React, Node.js',
      ai_reasoning: 'Test',
    };

    const result = AIScoreResultSchema.safeParse(response);
    assert.strictEqual(result.success, false);
  });
});

describe('JobAdDataSchema', () => {
  it('should accept valid job ad', () => {
    const jobAd = {
      title: 'Frontend Developer',
      company: 'Tech Company AB',
      description: 'Vi söker en erfaren frontend-utvecklare...',
      location: 'Stockholm',
      category: 'Software Development',
      external_url: 'https://company.se/jobs/123',
      posted_date: '2024-01-15',
    };

    const result = JobAdDataSchema.safeParse(jobAd);
    assert.strictEqual(result.success, true);
  });

  it('should reject missing title', () => {
    const jobAd = {
      company: 'Tech Company AB',
      description: 'Description',
      location: 'Stockholm',
      category: 'Tech',
      external_url: 'https://company.se/jobs/123',
      posted_date: '2024-01-15',
    };

    const result = JobAdDataSchema.safeParse(jobAd);
    assert.strictEqual(result.success, false);
  });

  it('should reject empty title', () => {
    const jobAd = {
      title: '',
      company: 'Tech Company AB',
      description: 'Description',
      location: 'Stockholm',
      category: 'Tech',
      external_url: 'https://company.se/jobs/123',
      posted_date: '2024-01-15',
    };

    const result = JobAdDataSchema.safeParse(jobAd);
    assert.strictEqual(result.success, false);
  });

  it('should reject invalid URL', () => {
    const jobAd = {
      title: 'Developer',
      company: 'Tech Company AB',
      description: 'Description',
      location: 'Stockholm',
      category: 'Tech',
      external_url: 'not-a-url',
      posted_date: '2024-01-15',
    };

    const result = JobAdDataSchema.safeParse(jobAd);
    assert.strictEqual(result.success, false);
  });

  it('should accept various valid URL formats', () => {
    const baseJobAd = {
      title: 'Developer',
      company: 'Tech Company AB',
      description: 'Description',
      location: 'Stockholm',
      category: 'Tech',
      posted_date: '2024-01-15',
    };

    const urls = [
      'https://example.com',
      'https://example.com/path',
      'https://sub.example.com/path?query=1',
      'http://localhost:3000/jobs',
    ];

    for (const url of urls) {
      const result = JobAdDataSchema.safeParse({ ...baseJobAd, external_url: url });
      assert.strictEqual(result.success, true, `URL should be valid: ${url}`);
    }
  });
});

describe('AI Response Parsing Edge Cases', () => {
  it('should handle markdown code block stripping', () => {
    // Simulating what the AI service does when parsing responses
    const rawResponse = '```json\n{"lead_score": 75, "role_category": "Tech", "classification": "valid_lead", "key_requirements": [], "ai_reasoning": "Valid"}\n```';

    // Strip markdown code blocks (same logic as aiService)
    const cleaned = rawResponse
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    const result = AIScoreResultSchema.safeParse(parsed);

    assert.strictEqual(result.success, true);
  });

  it('should handle response without code blocks', () => {
    const rawResponse = '{"lead_score": 75, "role_category": "Tech", "classification": "valid_lead", "key_requirements": [], "ai_reasoning": "Valid"}';

    const parsed = JSON.parse(rawResponse);
    const result = AIScoreResultSchema.safeParse(parsed);

    assert.strictEqual(result.success, true);
  });
});
