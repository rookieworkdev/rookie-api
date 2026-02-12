/**
 * Unit tests: Indeed scraper — normalization, filtering, and domain guessing
 *
 * Tests the pure functions in the Indeed scraper pipeline using realistic
 * mock data (no external API calls). Covers:
 * - normalizeIndeedJob(): raw Apify data → common NormalizedJob format
 * - filterByExclusions(): keyword-based job filtering
 * - guessCompanyDomain() / normalizeCompanyName(): company → domain logic
 *
 * Run from project root:
 *   pnpm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeIndeedJob } from '../dist/services/jobs/indeedJobScraper.js';
import {
  filterByExclusions,
  guessCompanyDomain,
  normalizeCompanyName,
} from '../dist/services/jobs/scraperUtils.js';

// ─── Mock data: realistic Swedish Indeed jobs ────────────────────────────────

const MOCK_RAW_INDEED_JOBS = [
  {
    id: 'indeed-001',
    positionName: 'Junior Frontend-utvecklare',
    company: 'Spotify AB',
    location: 'Stockholm, Sverige',
    description:
      'Vi söker en junior frontend-utvecklare med erfarenhet av React och TypeScript. Du kommer arbeta i ett agilt team med moderna verktyg. Krav: 1-3 års erfarenhet. Skicka ansökan till jobb@spotify.se',
    url: 'https://se.indeed.com/viewjob?jk=abc123',
    externalApplyLink: 'https://jobs.lever.co/spotify/abc123',
    postingDateParsed: '2026-02-10',
    jobType: ['Heltid'],
    salary: '35 000 - 45 000 kr/mån',
  },
  {
    id: 'indeed-002',
    positionName: 'Ekonomiassistent',
    company: 'Nordea Aktiebolag',
    location: 'Göteborg',
    description:
      'Nordea söker en ekonomiassistent till vår avdelning i Göteborg. Du ansvarar för löpande bokföring, fakturering och bankavstämningar. Erfarenhet av Fortnox är meriterande.',
    url: 'https://se.indeed.com/viewjob?jk=def456',
    postingDateParsed: '2026-02-08',
    postedAt: '2026-02-07',
    jobType: ['Heltid', 'Tillsvidare'],
  },
  {
    id: 'indeed-003',
    positionName: 'Kundtjänstmedarbetare',
    company: 'Klarna Sweden',
    location: 'Stockholm',
    description:
      'Klarna söker en serviceinriktad person till vårt kundtjänstteam. Du svarar på kundärenden via telefon, chatt och e-post. Kontakt: anna.svensson@klarna.com',
    url: 'https://se.indeed.com/viewjob?jk=ghi789',
    externalApplyLink: 'https://klarna.com/careers/ghi789',
    postedAt: '2026-02-11',
    jobType: ['Heltid'],
  },
  {
    id: 'indeed-004',
    positionName: 'Sjuksköterska natt',
    company: 'Karolinska Universitetssjukhuset',
    location: 'Solna',
    description: 'Vi söker sjuksköterska till nattpass på Karolinska. Krav: legitimerad sjuksköterska.',
    url: 'https://se.indeed.com/viewjob?jk=jkl012',
    postingDateParsed: '2026-02-09',
    jobType: ['Heltid'],
  },
  {
    id: 'indeed-005',
    positionName: 'Data Engineer',
    company: 'Einride',
    location: 'Stockholm, Hybrid',
    description:
      'Join Einride as a Data Engineer building our autonomous freight platform. You will work with Python, Spark, and BigQuery. Experience: 2-5 years. Apply at careers@einride.tech',
    url: 'https://se.indeed.com/viewjob?jk=mno345',
    externalApplyLink: 'https://einride.tech/careers/mno345',
    postingDateParsed: '2026-02-11',
    jobType: ['Heltid'],
    salary: '45 000 - 55 000 kr/mån',
  },
];

// Minimal job — only required fields, everything else missing
const MOCK_MINIMAL_JOB = {
  id: 'indeed-minimal',
  positionName: '',
  company: '',
  location: '',
  description: '',
  url: '',
};

// ─── normalizeIndeedJob ──────────────────────────────────────────────────────

describe('normalizeIndeedJob', () => {
  it('should normalize a complete Indeed job correctly', () => {
    const raw = MOCK_RAW_INDEED_JOBS[0];
    const result = normalizeIndeedJob(raw);

    assert.strictEqual(result.externalId, 'indeed-001');
    assert.strictEqual(result.title, 'Junior Frontend-utvecklare');
    assert.strictEqual(result.company, 'Spotify AB');
    assert.strictEqual(result.location, 'Stockholm, Sverige');
    assert.strictEqual(result.url, 'https://se.indeed.com/viewjob?jk=abc123');
    assert.strictEqual(result.applicationUrl, 'https://jobs.lever.co/spotify/abc123');
    assert.strictEqual(result.postedAt, '2026-02-10');
    assert.strictEqual(result.jobType, 'Heltid');
    assert.strictEqual(result.salary, '35 000 - 45 000 kr/mån');
    assert.strictEqual(result.source, 'indeed');
    assert.ok(result.description.includes('frontend-utvecklare'));
    assert.deepStrictEqual(result.rawData, raw);
  });

  it('should use first jobType when array has multiple values', () => {
    const raw = MOCK_RAW_INDEED_JOBS[1]; // jobType: ['Heltid', 'Tillsvidare']
    const result = normalizeIndeedJob(raw);

    assert.strictEqual(result.jobType, 'Heltid');
  });

  it('should prefer postingDateParsed over postedAt', () => {
    const raw = MOCK_RAW_INDEED_JOBS[1]; // has both postingDateParsed and postedAt
    const result = normalizeIndeedJob(raw);

    assert.strictEqual(result.postedAt, '2026-02-08');
  });

  it('should fall back to postedAt when postingDateParsed is missing', () => {
    const raw = MOCK_RAW_INDEED_JOBS[2]; // only has postedAt
    const result = normalizeIndeedJob(raw);

    assert.strictEqual(result.postedAt, '2026-02-11');
  });

  it('should handle missing optional fields gracefully', () => {
    const result = normalizeIndeedJob(MOCK_MINIMAL_JOB);

    assert.strictEqual(result.externalId, 'indeed-minimal');
    assert.strictEqual(result.title, '');
    assert.strictEqual(result.company, '');
    assert.strictEqual(result.applicationUrl, undefined);
    assert.strictEqual(result.postedAt, undefined);
    assert.strictEqual(result.jobType, undefined);
    assert.strictEqual(result.salary, undefined);
    assert.strictEqual(result.source, 'indeed');
  });

  it('should always set source to indeed', () => {
    for (const raw of MOCK_RAW_INDEED_JOBS) {
      const result = normalizeIndeedJob(raw);
      assert.strictEqual(result.source, 'indeed');
    }
  });

  it('should preserve raw data for later reference', () => {
    const raw = MOCK_RAW_INDEED_JOBS[4];
    const result = normalizeIndeedJob(raw);

    assert.strictEqual(result.rawData.id, 'indeed-005');
    assert.strictEqual(result.rawData.company, 'Einride');
    assert.deepStrictEqual(result.rawData.jobType, ['Heltid']);
  });
});

// ─── filterByExclusions ─────────────────────────────────────────────────────

describe('filterByExclusions', () => {
  // Normalize all mock jobs first so we work with NormalizedJob format
  const normalizedJobs = MOCK_RAW_INDEED_JOBS.map(normalizeIndeedJob);

  it('should filter out healthcare jobs by exclusion keyword', () => {
    const exclusions = ['sjuksköterska'];
    const result = filterByExclusions(normalizedJobs, exclusions);

    assert.strictEqual(result.length, 4);
    assert.ok(!result.some((j) => j.title.toLowerCase().includes('sjuksköterska')));
  });

  it('should filter based on title, company, and description', () => {
    // 'sjuksköterska' appears in the title of job 4
    const exclusions = ['sjuksköterska'];
    const result = filterByExclusions(normalizedJobs, exclusions);

    const excluded = normalizedJobs.filter((j) => !result.includes(j));
    assert.strictEqual(excluded.length, 1);
    assert.strictEqual(excluded[0].externalId, 'indeed-004');
  });

  it('should be case-insensitive', () => {
    const exclusions = ['SJUKSKÖTERSKA'];
    const result = filterByExclusions(normalizedJobs, exclusions);

    assert.strictEqual(result.length, 4);
  });

  it('should return all jobs when no exclusion matches', () => {
    const exclusions = ['tandläkare', 'veterinär'];
    const result = filterByExclusions(normalizedJobs, exclusions);

    assert.strictEqual(result.length, normalizedJobs.length);
  });

  it('should return all jobs for empty exclusion list', () => {
    const result = filterByExclusions(normalizedJobs, []);

    assert.strictEqual(result.length, normalizedJobs.length);
  });

  it('should handle multiple matching exclusions', () => {
    const exclusions = ['sjuksköterska', 'kundtjänst'];
    const result = filterByExclusions(normalizedJobs, exclusions);

    // Should filter out "Sjuksköterska natt" and "Kundtjänstmedarbetare"
    assert.strictEqual(result.length, 3);
  });
});

// ─── normalizeCompanyName ────────────────────────────────────────────────────

describe('normalizeCompanyName', () => {
  it('should strip AB suffix', () => {
    assert.strictEqual(normalizeCompanyName('Spotify AB'), 'spotify');
  });

  it('should strip Aktiebolag suffix', () => {
    assert.strictEqual(normalizeCompanyName('Nordea Aktiebolag'), 'nordea');
  });

  it('should strip Sweden suffix', () => {
    assert.strictEqual(normalizeCompanyName('Klarna Sweden'), 'klarna');
  });

  it('should strip Sverige suffix', () => {
    assert.strictEqual(normalizeCompanyName('Volvo Sverige'), 'volvo');
  });

  it('should strip Stockholm suffix', () => {
    assert.strictEqual(normalizeCompanyName('Acme Stockholm'), 'acme');
  });

  it('should lowercase the result', () => {
    assert.strictEqual(normalizeCompanyName('ERICSSON'), 'ericsson');
  });

  it('should handle already clean names', () => {
    assert.strictEqual(normalizeCompanyName('Einride'), 'einride');
  });
});

// ─── guessCompanyDomain ─────────────────────────────────────────────────────

describe('guessCompanyDomain', () => {
  it('should generate .se domain from company name', () => {
    assert.strictEqual(guessCompanyDomain('Spotify AB'), 'spotify.se');
  });

  it('should strip Aktiebolag before guessing', () => {
    assert.strictEqual(guessCompanyDomain('Nordea Aktiebolag'), 'nordea.se');
  });

  it('should handle multi-word company names with hyphens', () => {
    assert.strictEqual(guessCompanyDomain('Tech Company AB'), 'tech-company.se');
  });

  it('should return null for very short names', () => {
    assert.strictEqual(guessCompanyDomain('AB'), null);
  });

  it('should strip special characters', () => {
    const result = guessCompanyDomain('Företag & Partners AB');
    assert.ok(!result.includes('&'));
    assert.ok(result.endsWith('.se'));
  });

  it('should handle real Swedish company names', () => {
    assert.strictEqual(guessCompanyDomain('Klarna Sweden'), 'klarna.se');
    assert.strictEqual(guessCompanyDomain('Einride'), 'einride.se');
    assert.strictEqual(guessCompanyDomain('Volvo Aktiebolag'), 'volvo.se');
  });
});
