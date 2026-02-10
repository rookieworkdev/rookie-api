import { ApifyClient } from 'apify-client';
import { config } from '../../config/env.js';
import {
  indeedConfig,
  defaultIndeedKeywords,
  defaultExclusionKeywords,
} from '../../config/scrapers/jobs/indeed.config.js';
import { logger, getErrorMessage } from '../../utils/logger.js';
import { parseRawIndeedJobs } from '../../schemas/scraper.js';
import type { RawIndeedJob, NormalizedJob, ScraperRunConfig } from '../../types/scraper.types.js';

/**
 * Fetch jobs from Indeed using Apify actor
 */
export async function fetchIndeedJobs(runConfig?: ScraperRunConfig): Promise<RawIndeedJob[]> {
  if (!config.apify.apiKey) {
    throw new Error('APIFY_API_KEY is not configured');
  }

  const client = new ApifyClient({
    token: config.apify.apiKey,
  });

  const keywords = runConfig?.keywords || config.scraper.keywords || defaultIndeedKeywords;
  const country = runConfig?.country || config.scraper.country || indeedConfig.defaultCountry;
  const maxItems = runConfig?.maxItems || config.scraper.maxItems || indeedConfig.defaultMaxItems;

  logger.info('Starting Indeed scraper', {
    country,
    maxItems,
    keywordsLength: keywords.length,
  });

  try {
    // Run the Apify actor
    const run = await client.actor(indeedConfig.apifyActorId).call({
      country,
      position: keywords,
      maxItems,
      followApplyRedirects: false,
      parseCompanyDetails: false,
      saveOnlyUniqueItems: true,
      proxy: { useApifyProxy: true },
      sort: 'date',
    });

    // Fetch results from the dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    logger.info('Indeed scraper completed', {
      totalItems: items.length,
      runId: run.id,
    });

    // Parse and validate the raw jobs
    const validJobs = parseRawIndeedJobs(items);

    logger.info('Parsed Indeed jobs', {
      raw: items.length,
      valid: validJobs.length,
    });

    return validJobs as RawIndeedJob[];
  } catch (error) {
    logger.error('Indeed scraper failed', error);
    throw new Error(`Indeed scraper failed: ${getErrorMessage(error)}`);
  }
}

/**
 * Normalize an Indeed job to the common format
 */
export function normalizeIndeedJob(raw: RawIndeedJob): NormalizedJob {
  return {
    externalId: raw.id,
    title: raw.positionName || '',
    company: raw.company || '',
    location: raw.location || '',
    description: raw.description || '',
    url: raw.url || '',
    applicationUrl: raw.externalApplyLink,
    postedAt: raw.postingDateParsed || raw.postedAt,
    jobType: Array.isArray(raw.jobType) ? raw.jobType[0] : raw.jobType,
    salary: raw.salary,
    source: 'indeed',
    rawData: raw as unknown as Record<string, unknown>,
  };
}

/**
 * Filter jobs by exclusion keywords
 */
export function filterByExclusions(
  jobs: NormalizedJob[],
  exclusionKeywords?: string[]
): NormalizedJob[] {
  const exclusions = exclusionKeywords || config.scraper.exclusionKeywords || defaultExclusionKeywords;

  if (exclusions.length === 0) {
    return jobs;
  }

  const lowerExclusions = exclusions.map((k) => k.toLowerCase().trim()).filter(Boolean);

  const filtered = jobs.filter((job) => {
    const title = job.title.toLowerCase();
    const company = job.company.toLowerCase();
    const description = job.description.toLowerCase();

    const hasExclusion = lowerExclusions.some(
      (exclusion) =>
        title.includes(exclusion) || company.includes(exclusion) || description.includes(exclusion)
    );

    if (hasExclusion) {
      logger.debug('Job excluded by keyword', { title: job.title, company: job.company });
    }

    return !hasExclusion;
  });

  logger.info('Filtered jobs by exclusions', {
    before: jobs.length,
    after: filtered.length,
    excluded: jobs.length - filtered.length,
  });

  return filtered;
}

/**
 * Normalize company name for domain guessing
 */
export function normalizeCompanyName(company: string): string {
  return company
    .toLowerCase()
    .replace(/\s+(ab|aktiebolag|sweden|sverige|stockholm|göteborg|malmö)$/gi, '')
    .trim();
}

/**
 * Guess company domain from company name
 */
export function guessCompanyDomain(company: string): string | null {
  const normalized = normalizeCompanyName(company);

  if (normalized.length < 3) {
    return null;
  }

  // Simple domain generation: company-name.se
  // In production, this could call an enrichment API
  return (
    normalized
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 63) + '.se'
  );
}

/**
 * Run the full Indeed scraper pipeline
 * Returns normalized jobs ready for processing
 */
export async function runIndeedFetch(
  runConfig?: ScraperRunConfig
): Promise<{ jobs: NormalizedJob[]; raw: RawIndeedJob[] }> {
  // 1. Fetch from Apify
  const rawJobs = await fetchIndeedJobs(runConfig);

  // 2. Normalize to common format
  const normalizedJobs = rawJobs.map(normalizeIndeedJob);

  // 3. Filter by exclusion keywords
  const filteredJobs = filterByExclusions(normalizedJobs, runConfig?.exclusionKeywords);

  return {
    jobs: filteredJobs,
    raw: rawJobs,
  };
}
