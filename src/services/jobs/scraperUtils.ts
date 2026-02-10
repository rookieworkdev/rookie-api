import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { NormalizedJob } from '../../types/scraper.types.js';

/**
 * Default exclusion keywords for job scrapers.
 * These filter out roles outside Rookie's target market (healthcare, trades, etc.)
 */
export const defaultExclusionKeywords = [
  'lärare',
  'undersköterska',
  'sjuksköterska',
  'läkare',
  'snickare',
  'hantverkare',
  'städare',
  'lokalvård',
  'kock',
  'servitör',
  'bartender',
];

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
    .replace(/\s+(ab|aktiebolag|sweden|sverige|stockholm|göteborg|malmö)$/g, '')
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
