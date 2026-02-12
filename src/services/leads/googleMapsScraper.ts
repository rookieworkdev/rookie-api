import { ApifyClient } from 'apify-client';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/env.js';
import {
  googleMapsConfig,
  competitorExclusions,
  recruitmentCategories,
  recruitmentRoles,
} from '../../config/scrapers/leads/googleMaps.config.js';
import { logger, getErrorMessage } from '../../utils/logger.js';
import { parseRawGoogleMapsPlaces, type RawGoogleMapsPlaceType } from '../../schemas/scraper.js';
import { evaluateCompany } from '../aiService.js';
import {
  findOrCreateCompany,
  updateCompanyScore,
  createGoogleMapsSignal,
  upsertGoogleMapsContact,
  updateCompanyEnrichment,
} from '../supabaseService.js';
import type {
  NormalizedGoogleMapsCompany,
  CompanyEvaluationResult,
  ProcessedCompany,
  LeadScraperRunResult,
} from '../../types/scraper.types.js';

// ============================================================================
// FETCH
// ============================================================================

/**
 * Fetch places from Google Maps via Apify actor across all search queries
 */
export async function fetchGoogleMapsPlaces(
  searchQueries: string[],
  maxItemsPerQuery: number = googleMapsConfig.defaultMaxItemsPerQuery
): Promise<RawGoogleMapsPlaceType[]> {
  if (!config.apify.apiKey) {
    throw new Error('APIFY_API_KEY is not configured');
  }

  const client = new ApifyClient({ token: config.apify.apiKey });
  const allPlaces: RawGoogleMapsPlaceType[] = [];
  const seenPlaceIds = new Set<string>();

  logger.info('Starting Google Maps scraper', {
    queries: searchQueries.length,
    maxItemsPerQuery,
  });

  for (const query of searchQueries) {
    logger.info('Fetching Google Maps query', { query, maxItemsPerQuery });

    try {
      const run = await client.actor(googleMapsConfig.apifyActorId).call({
        searchStringsArray: [query],
        maxCrawledPlacesPerSearch: maxItemsPerQuery,
        language: googleMapsConfig.language,
        countryCode: googleMapsConfig.countryFilter.toLowerCase(),
        scrapeBusinessLeads: googleMapsConfig.scrapeBusinessLeads,
        maximumLeadsEnrichmentRecords: googleMapsConfig.maximumLeadsEnrichmentRecords,
        leadsEnrichmentDepartments: googleMapsConfig.leadsEnrichmentDepartments,
        leadsSeniority: googleMapsConfig.leadsSeniority,
        onePerGoogleMapsUrl: true,
      });

      const { items } = await client.dataset(run.defaultDatasetId).listItems();

      const validPlaces = parseRawGoogleMapsPlaces(items);

      // Deduplicate across queries by placeId
      let newCount = 0;
      for (const place of validPlaces) {
        if (!seenPlaceIds.has(place.placeId)) {
          seenPlaceIds.add(place.placeId);
          allPlaces.push(place);
          newCount++;
        }
      }

      logger.info('Google Maps query complete', {
        query,
        fetched: items.length,
        valid: validPlaces.length,
        new: newCount,
      });
    } catch (error) {
      logger.error('Error fetching Google Maps query', error, { query });
      // Continue to next query
    }
  }

  logger.info('Google Maps fetch complete', { totalPlaces: allPlaces.length });

  return allPlaces;
}

// ============================================================================
// FILTER
// ============================================================================

/**
 * Filter places: must have website + country 'SE', exclude competitors and recruitment firms
 */
export function filterPlaces(places: RawGoogleMapsPlaceType[]): RawGoogleMapsPlaceType[] {
  const before = places.length;

  const filtered = places.filter((place) => {
    // Must have website
    if (!place.website) return false;

    // Must be in Sweden
    if (place.countryCode?.toUpperCase() !== 'SE') return false;

    const titleLower = place.title.toLowerCase();

    // Exclude exact competitor names
    if (competitorExclusions.some((comp) => titleLower === comp)) return false;

    // Exclude recruitment categories
    const categoryLower = (place.categoryName || '').toLowerCase();
    if (recruitmentCategories.some((cat) => categoryLower.includes(cat))) return false;

    // Exclude companies where ALL leads have recruitment titles
    if (place.leadsEnrichment && place.leadsEnrichment.length > 0) {
      const allRecruitment = place.leadsEnrichment.every((lead) => {
        const title = (lead.jobTitle || lead.headline || '').toLowerCase();
        return recruitmentRoles.some((role) => title.includes(role));
      });
      if (allRecruitment) return false;
    }

    return true;
  });

  logger.info('Places filtered', {
    before,
    after: filtered.length,
    excluded: before - filtered.length,
  });

  return filtered;
}

// ============================================================================
// NORMALIZE
// ============================================================================

/**
 * Extract clean domain from a website URL
 */
export function extractDomain(website: string): string {
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    // Fallback: strip protocol and path manually
    return website
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .toLowerCase()
      .trim();
  }
}

/**
 * Normalize a raw Google Maps place to the common company format
 */
export function normalizePlace(raw: RawGoogleMapsPlaceType): NormalizedGoogleMapsCompany {
  const domain = extractDomain(raw.website!); // website guaranteed by filter

  // Coerce null → undefined (Zod schema uses .nullable(), interface uses optional)
  return {
    placeId: raw.placeId,
    name: raw.title,
    domain,
    website: raw.website!,
    category: raw.categoryName ?? undefined,
    address: raw.address ?? undefined,
    city: raw.city ?? undefined,
    countryCode: raw.countryCode ?? undefined,
    reviewsCount: raw.reviewsCount ?? undefined,
    phone: (raw.phone || raw.phoneUnformatted) ?? undefined,
    googleRating: raw.totalScore ?? undefined,
    leads: (raw.leadsEnrichment ?? []).map((lead) => ({
      firstName: lead.firstName ?? undefined,
      lastName: lead.lastName ?? undefined,
      fullName: lead.fullName ?? undefined,
      jobTitle: lead.jobTitle ?? undefined,
      headline: lead.headline ?? undefined,
      email: lead.email ?? undefined,
      linkedinProfile: lead.linkedinProfile ?? undefined,
      photoUrl: lead.photoUrl ?? undefined,
      departments: lead.departments ?? undefined,
      seniority: lead.seniority ?? undefined,
      mobileNumber: lead.mobileNumber ?? undefined,
    })),
    rawData: raw as unknown as Record<string, unknown>,
  };
}

// ============================================================================
// PROCESS
// ============================================================================

/**
 * Process a single company: AI evaluate → DB operations → contacts
 */
export async function processCompany(
  company: NormalizedGoogleMapsCompany
): Promise<ProcessedCompany> {
  try {
    // 1. AI evaluate company (with fallback on failure)
    let evaluation: CompanyEvaluationResult;
    try {
      evaluation = await evaluateCompany(company);
    } catch (aiError) {
      logger.error('AI company evaluation failed, saving with fallback', aiError, {
        name: company.name, domain: company.domain,
      });
      evaluation = {
        isValid: false,
        score: 0,
        reasoning: `AI evaluation error: ${getErrorMessage(aiError)}`,
        industryCategory: 'AI Evaluation Failed',
        sizeEstimate: 'Unknown',
      };
    }

    // 2. Find or create company in DB
    const companyId = await findOrCreateCompany(
      company.name,
      company.domain,
      'google_maps'
    );

    // 3. Update company score
    await updateCompanyScore(
      companyId,
      evaluation.score,
      evaluation.industryCategory,
      evaluation.reasoning
    );

    // 4. Enrich company with Google Maps data
    await updateCompanyEnrichment(companyId, {
      website: company.website,
    });

    // 5. Create signal
    const signalResult = await createGoogleMapsSignal(companyId, {
      placeId: company.placeId,
      name: company.name,
      category: company.category,
      city: company.city,
      score: evaluation.score,
      isValid: evaluation.isValid,
      industryCategory: evaluation.industryCategory,
      sizeEstimate: evaluation.sizeEstimate,
      reasoning: evaluation.reasoning,
      website: company.website,
      leadsCount: company.leads.length,
    });

    // 6. Upsert contacts from leadsEnrichment
    let contactsCreated = 0;
    for (const lead of company.leads) {
      const result = await upsertGoogleMapsContact(companyId, lead);
      if (result) contactsCreated++;
    }

    return {
      company,
      evaluation,
      companyId,
      signalId: signalResult.id,
      contactsCreated,
      success: true,
    };
  } catch (error) {
    logger.error('Error processing company', error, {
      name: company.name,
      domain: company.domain,
    });

    return {
      company,
      evaluation: {
        isValid: false,
        score: 0,
        reasoning: getErrorMessage(error),
        industryCategory: 'Error',
        sizeEstimate: 'Unknown',
      },
      companyId: '',
      signalId: '',
      contactsCreated: 0,
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Process companies in batches with concurrency control
 */
export async function processCompanyBatch(
  companies: NormalizedGoogleMapsCompany[],
  concurrency: number = 3
): Promise<ProcessedCompany[]> {
  const results: ProcessedCompany[] = [];

  for (let i = 0; i < companies.length; i += concurrency) {
    const chunk = companies.slice(i, i + concurrency);

    const chunkResults = await Promise.all(chunk.map(processCompany));
    results.push(...chunkResults);

    logger.info('Company batch progress', {
      completed: Math.min(i + concurrency, companies.length),
      total: companies.length,
      successRate: `${results.filter((r) => r.success).length}/${results.length}`,
    });
  }

  return results;
}

// ============================================================================
// ORCHESTRATION
// ============================================================================

/**
 * Run the full Google Maps lead scraping pipeline
 */
export async function runGoogleMapsFetch(runConfig?: {
  searchQueries?: string[];
  maxItemsPerQuery?: number;
}): Promise<LeadScraperRunResult> {
  const runId = uuidv4();
  const startTime = new Date();
  const queries = runConfig?.searchQueries || googleMapsConfig.defaultSearchQueries;
  const maxItems = runConfig?.maxItemsPerQuery || googleMapsConfig.defaultMaxItemsPerQuery;

  logger.info('Starting Google Maps lead pipeline', {
    runId,
    queries: queries.length,
    maxItemsPerQuery: maxItems,
  });

  try {
    // 1. Fetch from Apify
    const rawPlaces = await fetchGoogleMapsPlaces(queries, maxItems);

    // 2. Filter
    const filteredPlaces = filterPlaces(rawPlaces);

    if (filteredPlaces.length === 0) {
      logger.info('No places after filtering', { runId });

      return {
        source: 'google_maps',
        runId,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        stats: {
          fetched: rawPlaces.length,
          afterFilter: 0,
          processed: 0,
          valid: 0,
          discarded: 0,
          contactsCreated: 0,
          errors: 0,
        },
        validCompanies: [],
        discardedCompanies: [],
        errors: [],
      };
    }

    // 3. Normalize
    const companies = filteredPlaces.map(normalizePlace);

    // 4. Process all companies (AI + DB)
    const processed = await processCompanyBatch(companies);

    // 5. Separate results
    const validCompanies = processed.filter((p) => p.success && p.evaluation.isValid);
    const discardedCompanies = processed.filter((p) => p.success && !p.evaluation.isValid);
    const errors = processed
      .filter((p) => !p.success)
      .map((p) => ({ company: p.company, error: p.error || 'Unknown error' }));

    const totalContacts = processed.reduce((sum, p) => sum + p.contactsCreated, 0);
    const endTime = new Date();

    const result: LeadScraperRunResult = {
      source: 'google_maps',
      runId,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      stats: {
        fetched: rawPlaces.length,
        afterFilter: filteredPlaces.length,
        processed: processed.length,
        valid: validCompanies.length,
        discarded: discardedCompanies.length,
        contactsCreated: totalContacts,
        errors: errors.length,
      },
      validCompanies,
      discardedCompanies,
      errors,
    };

    logger.info('Google Maps lead pipeline complete', {
      runId,
      duration: result.duration,
      stats: result.stats,
    });

    return result;
  } catch (error) {
    logger.error('Google Maps lead pipeline failed', error, { runId });

    return {
      source: 'google_maps',
      runId,
      startTime,
      endTime: new Date(),
      duration: Date.now() - startTime.getTime(),
      stats: {
        fetched: 0,
        afterFilter: 0,
        processed: 0,
        valid: 0,
        discarded: 0,
        contactsCreated: 0,
        errors: 1,
      },
      validCompanies: [],
      discardedCompanies: [],
      errors: [{ error: getErrorMessage(error) }],
    };
  }
}
