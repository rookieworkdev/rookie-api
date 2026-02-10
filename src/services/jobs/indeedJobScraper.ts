import { ApifyClient } from 'apify-client';
import { config } from '../../config/env.js';
import {
  indeedConfig,
  defaultIndeedKeywords,
} from '../../config/scrapers/jobs/indeed.config.js';
import { logger, getErrorMessage } from '../../utils/logger.js';
import { parseRawIndeedJobs } from '../../schemas/scraper.js';
import { filterByExclusions } from './scraperUtils.js';
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
