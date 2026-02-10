import { ApifyClient } from 'apify-client';
import { config } from '../../config/env.js';
import {
  linkedinConfig,
  defaultLinkedInExclusionKeywords,
  buildLinkedInSearchUrl,
} from '../../config/scrapers/jobs/linkedin.config.js';
import { logger } from '../../utils/logger.js';
import { parseRawLinkedInJobs } from '../../schemas/scraper.js';
import { filterByExclusions } from './scraperUtils.js';
import type { RawLinkedInJob, NormalizedJob, ScraperRunConfig } from '../../types/scraper.types.js';

/**
 * Fetch jobs from LinkedIn using Apify actor across all categories
 * Runs categories sequentially and deduplicates across them by raw id
 */
export async function fetchLinkedInJobs(runConfig?: ScraperRunConfig): Promise<RawLinkedInJob[]> {
  if (!config.apify.apiKey) {
    throw new Error('APIFY_API_KEY is not configured');
  }

  const client = new ApifyClient({
    token: config.apify.apiKey,
  });

  const requestedMaxItems = runConfig?.maxItems || config.scraper.maxItems || linkedinConfig.defaultMaxItemsPerCategory;
  // Apify actor requires count >= 100; clamp to that minimum
  const maxItems = Math.max(requestedMaxItems, 100);
  const seenIds = new Set<string>();
  const allJobs: RawLinkedInJob[] = [];

  logger.info('Starting LinkedIn scraper', {
    categories: linkedinConfig.categories.length,
    maxItemsPerCategory: maxItems,
    requestedMaxItems,
  });

  for (const category of linkedinConfig.categories) {
    const searchUrl = buildLinkedInSearchUrl(category.keywords);

    logger.info('Fetching LinkedIn category', {
      category: category.name,
      maxItems,
    });

    try {
      const run = await client.actor(linkedinConfig.apifyActorId).call({
        urls: [searchUrl],
        count: maxItems,
        scrapeCompany: true,
      });

      const { items } = await client.dataset(run.defaultDatasetId).listItems();

      // Validate with Zod
      const validJobs = parseRawLinkedInJobs(items);

      // Deduplicate across categories by raw id
      let newCount = 0;
      for (const job of validJobs) {
        if (!seenIds.has(job.id)) {
          seenIds.add(job.id);
          allJobs.push(job as RawLinkedInJob);
          newCount++;
        }
      }

      logger.info('LinkedIn category completed', {
        category: category.name,
        rawItems: items.length,
        validItems: validJobs.length,
        newItems: newCount,
        duplicatesSkipped: validJobs.length - newCount,
      });
    } catch (error) {
      // Log and continue with remaining categories (don't fail the whole run)
      logger.error('LinkedIn category failed', error, { category: category.name });
    }
  }

  logger.info('LinkedIn scraper completed', {
    totalUniqueJobs: allJobs.length,
  });

  return allJobs;
}

/**
 * Normalize a LinkedIn job to the common format
 */
export function normalizeLinkedInJob(raw: RawLinkedInJob): NormalizedJob {
  return {
    externalId: raw.id,
    title: raw.title || '',
    company: raw.companyName || '',
    location: raw.location || '',
    description: raw.descriptionText || '',
    url: raw.link || '',
    applicationUrl: raw.applyUrl ?? undefined,
    postedAt: raw.postedAt ?? undefined,
    jobType: raw.employmentType ?? undefined,
    salary: raw.salaryInfo?.[0] ?? undefined,
    source: 'linkedin',
    rawData: raw as unknown as Record<string, unknown>,
  };
}

/**
 * Run the full LinkedIn scraper pipeline
 * Returns normalized jobs ready for processing
 */
export async function runLinkedInFetch(
  runConfig?: ScraperRunConfig
): Promise<{ jobs: NormalizedJob[]; raw: RawLinkedInJob[] }> {
  // 1. Fetch from Apify (all categories, deduplicated)
  const rawJobs = await fetchLinkedInJobs(runConfig);

  // 2. Normalize to common format
  const normalizedJobs = rawJobs.map(normalizeLinkedInJob);

  // 3. Filter by exclusion keywords
  const filteredJobs = filterByExclusions(
    normalizedJobs,
    runConfig?.exclusionKeywords || defaultLinkedInExclusionKeywords
  );

  return {
    jobs: filteredJobs,
    raw: rawJobs,
  };
}
