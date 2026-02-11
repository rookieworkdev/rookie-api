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
 * Paginates automatically if maxItems > 100 (API limit per request)
 */
export async function fetchAFJobs(runConfig?: ScraperRunConfig): Promise<RawAFJob[]> {
  const keywords = runConfig?.keywords || defaultAFKeywords;
  const totalRequested = runConfig?.maxItems || afConfig.defaultLimit;
  const pageSize = Math.min(totalRequested, 100); // API max per request

  logger.info('Starting AF scraper', {
    totalRequested,
    keywordsLength: keywords.length,
  });

  const allJobs: RawAFJob[] = [];
  let offset = 0;

  try {
    while (allJobs.length < totalRequested) {
      const limit = Math.min(pageSize, totalRequested - allJobs.length);
      const url = buildAFSearchUrl(keywords, limit, afConfig.defaultPublishedAfterDays, offset);

      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`AF API returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as { hits?: unknown[]; total?: { value?: number } };
      const hits = data.hits ?? [];

      logger.info('AF API page received', {
        offset,
        limit,
        totalHits: data.total?.value ?? 0,
        returnedHits: hits.length,
      });

      if (hits.length === 0) break;

      const validJobs = parseRawAFJobs(hits);
      allJobs.push(...(validJobs as RawAFJob[]));
      offset += hits.length;

      // Stop if API returned fewer than requested (last page)
      if (hits.length < limit) break;
    }

    logger.info('AF scraper completed', {
      totalFetched: allJobs.length,
    });

    return allJobs;
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
