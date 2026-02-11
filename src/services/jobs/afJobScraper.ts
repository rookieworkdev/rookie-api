import {
  afConfig,
  defaultAFKeywords,
  defaultAFExclusionKeywords,
  buildAFSearchUrl,
} from '../../config/scrapers/jobs/af.config.js';
import { logger, getErrorMessage } from '../../utils/logger.js';
import { parseRawAFJobs } from '../../schemas/scraper.js';
import { filterByExclusions } from './scraperUtils.js';
import type { RawAFJob, NormalizedJob, ScraperRunConfig } from '../../types/scraper.types.js';

/**
 * Fetch jobs from Arbetsformedlingen JobTech API (public, no auth required)
 */
export async function fetchAFJobs(runConfig?: ScraperRunConfig): Promise<RawAFJob[]> {
  const keywords = runConfig?.keywords || defaultAFKeywords;
  const limit = runConfig?.maxItems || afConfig.defaultLimit;

  const url = buildAFSearchUrl(keywords, limit);

  logger.info('Starting AF scraper', {
    limit,
    keywordsLength: keywords.length,
  });

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`AF API returned ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as { hits?: unknown[]; total?: { value?: number } };
    const hits = data.hits ?? [];

    logger.info('AF API response received', {
      totalHits: data.total?.value ?? hits.length,
      returnedHits: hits.length,
    });

    // Parse and validate the raw jobs
    const validJobs = parseRawAFJobs(hits);

    logger.info('Parsed AF jobs', {
      raw: hits.length,
      valid: validJobs.length,
    });

    return validJobs as RawAFJob[];
  } catch (error) {
    logger.error('AF scraper failed', error);
    throw new Error(`AF scraper failed: ${getErrorMessage(error)}`);
  }
}

/**
 * Normalize an AF job to the common format
 */
export function normalizeAFJob(raw: RawAFJob): NormalizedJob {
  return {
    externalId: raw.id,
    title: raw.headline || '',
    company: raw.employer?.name || '',
    location:
      raw.workplace_address?.municipality ||
      raw.workplace_address?.region ||
      raw.workplace_address?.country ||
      'Sweden',
    description: raw.description?.text || raw.description?.text_formatted || '',
    url: raw.webpage_url || '',
    applicationUrl: raw.application_details?.url || raw.webpage_url,
    postedAt: raw.publication_date ?? undefined,
    jobType: raw.employment_type?.label || raw.duration?.label || undefined,
    salary: raw.salary_type?.label ?? undefined,
    source: 'arbetsformedlingen',
    rawData: raw as unknown as Record<string, unknown>,
  };
}

/**
 * Run the full AF scraper pipeline
 * Returns normalized jobs ready for processing
 */
export async function runAFFetch(
  runConfig?: ScraperRunConfig
): Promise<{ jobs: NormalizedJob[]; raw: RawAFJob[] }> {
  // 1. Fetch from JobTech API
  const rawJobs = await fetchAFJobs(runConfig);

  // 2. Normalize to common format
  const normalizedJobs = rawJobs.map(normalizeAFJob);

  // 3. Filter by exclusion keywords
  const filteredJobs = filterByExclusions(
    normalizedJobs,
    runConfig?.exclusionKeywords || defaultAFExclusionKeywords
  );

  return {
    jobs: filteredJobs,
    raw: rawJobs,
  };
}
