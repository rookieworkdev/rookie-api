import type { LinkedInScraperConfig } from '../../../types/scraper.types.js';
import { defaultExclusionKeywords } from '../../../services/jobs/scraperUtils.js';

export const linkedinConfig: LinkedInScraperConfig = {
  source: 'linkedin',
  apifyActorId: 'hKByXkMQaC5Qt9UMN', // curious_coder/linkedin-jobs-scraper
  geoId: '105117694', // Sweden
  defaultMaxItemsPerCategory: 10, // Low for testing, increase later
  categories: [
    {
      name: 'Tech/Engineering',
      keywords:
        '(junior OR graduate OR nyexaminerad OR nyexad OR entry-level OR entry level) AND (developer OR utvecklare OR ingenjor OR engineer OR software OR data OR IT OR programmering OR systemutvecklare OR mjukvaruutvecklare)',
      location: 'Sweden',
    },
    {
      name: 'Finance/Business',
      keywords:
        '(junior OR graduate OR nyexaminerad OR nyexad OR entry-level OR entry level) AND (ekonom OR finance OR analyst OR business OR controller OR redovisning OR bokforing OR accounting OR revisor OR finansanalytiker)',
      location: 'Sweden',
    },
    {
      name: 'Defense/Security',
      keywords:
        '(junior OR graduate OR nyexaminerad OR nyexad OR entry-level OR entry level) AND (sakerhet OR cybersakerhet OR forsvar OR security OR defense OR cybersecurity OR informationssakerhet)',
      location: 'Sweden',
    },
    {
      name: 'Admin/Support',
      keywords:
        '(junior OR graduate OR nyexaminerad OR nyexad OR entry-level OR entry level) AND (administration OR coordinator OR support OR assistent OR projektledare OR projektkoordinator OR kundtjanst OR customer service)',
      location: 'Sweden',
    },
    {
      name: 'Sales/Marketing',
      keywords:
        '(junior OR graduate OR nyexaminerad OR nyexad OR entry-level OR entry level) AND (saljare OR marknadsforing OR sales OR marketing OR commercial OR affarsutvecklare OR business development)',
      location: 'Sweden',
    },
  ],
  fieldMapping: {
    externalId: 'id',
    title: 'title',
    company: 'companyName',
    location: 'location',
    description: 'descriptionText',
    url: 'link',
    postedAt: 'postedAt',
    applicationUrl: 'applyUrl',
    jobType: 'employmentType',
    salary: 'salaryInfo',
  },
};

// Default exclusion keywords for LinkedIn (same as shared defaults, can be overridden via API)
export const defaultLinkedInExclusionKeywords = defaultExclusionKeywords;

/**
 * Build a LinkedIn Jobs search URL for a given category
 */
export function buildLinkedInSearchUrl(
  keywords: string,
  geoId: string = linkedinConfig.geoId
): string {
  const encoded = encodeURIComponent(keywords);
  return `https://www.linkedin.com/jobs/search/?keywords=${encoded}&location=Sweden&geoId=${geoId}&f_TPR=r86400&f_E=2%2C3&sortBy=DD`;
}
