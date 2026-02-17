import type { AFScraperConfig } from '../../../types/scraper.types.js';
import { defaultExclusionKeywords } from '../../../services/jobs/scraperUtils.js';

export const afConfig: AFScraperConfig = {
  source: 'arbetsformedlingen',
  apiBaseUrl: 'https://jobsearch.api.jobtechdev.se/search',
  defaultLimit: 100,
  defaultPublishedAfterDays: 15,
  fieldMapping: {
    externalId: 'id',
    title: 'headline',
    company: 'employer.name',
    location: 'workplace_address.municipality',
    description: 'description.text',
    url: 'webpage_url',
    postedAt: 'publication_date',
    applicationUrl: 'application_details.url',
    jobType: 'employment_type.label',
    salary: 'salary_type.label',
  },
};

// Default keywords for AF search (originally from n8n workflow, can be overridden via API)
export const defaultAFKeywords = `nyexad OR nyexaminerad OR nyutbildad OR nyexaminerade OR junior OR juniors OR juniorer OR graduate OR graduates OR karriarstart OR entry level OR entry-level OR kickstart OR kickstarta OR assistent OR assistenter OR ekonom OR ekonomi OR ekonomer OR ingenjor OR ingenjorer OR engineer OR engineers OR developer OR developers OR utvecklare OR utveckling OR backendutvecklare OR frontendutvecklare OR webbutvecklare OR finans OR finance OR fintech OR bank OR tjansteman OR banktjansteman OR forsakring OR forsakringsbolag OR insurance OR redovisning OR bokforing OR accounting OR tech OR tekniker OR technician OR software OR systemutveckling OR saas OR data OR datavetenskap OR analytics OR analytiker OR dataanalys OR logistik OR logistics OR inkop OR inkopare OR upphandlare OR lager OR lagerhallning OR warehouse OR transport OR transportor OR distribution OR distributor OR sales OR saljare OR forsaljning OR marketing OR marknadsforing OR marknadsforingsassistent OR affarsutveckling OR konsult OR konsulter OR byra OR byraer OR konsultbyra OR juridik OR jurist OR advokatbyra OR lawyer OR attorney OR administration OR administrator OR admin OR projektledning OR projektledare OR kundtjanst OR customer service OR kundansvarig OR support OR kundsupport OR supportpersonal OR HR OR personalfragor OR retail OR ecommerce OR e-handel OR manufacturing OR tillverkning OR industri OR medtech OR biotech OR medicinteknik OR energi OR energy OR utility OR elektricitet OR construction OR byggnad OR telecom OR telekom OR media OR kommunikation OR gaming OR operator OR fastighetsmaklare OR maklare OR facility`;

// Default exclusion keywords for AF (same as shared defaults, can be overridden via API)
export const defaultAFExclusionKeywords = defaultExclusionKeywords;

/**
 * Build a full AF JobTech API search URL with query parameters
 */
export function buildAFSearchUrl(
  keywords: string = defaultAFKeywords,
  limit: number = afConfig.defaultLimit,
  publishedAfterDays: number = afConfig.defaultPublishedAfterDays,
  offset: number = 0
): string {
  const publishedAfter = new Date();
  publishedAfter.setDate(publishedAfter.getDate() - publishedAfterDays);
  const publishedAfterISO = publishedAfter.toISOString();

  const params = new URLSearchParams({
    q: keywords,
    limit: limit.toString(),
    offset: offset.toString(),
    'published-after': publishedAfterISO,
  });

  return `${afConfig.apiBaseUrl}?${params.toString()}`;
}
