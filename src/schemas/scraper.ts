import { z } from 'zod';
import { logger } from '../utils/logger.js';

// Schema for raw Indeed job from Apify
// Note: Using lenient validation because Apify can return various formats
export const RawIndeedJobSchema = z.object({
  id: z.string(),
  positionName: z.string(),
  company: z.string(),
  location: z.string().optional().nullable().default(''),
  description: z.string().optional().nullable().default(''),
  // URL validation is lenient - Apify can return URLs with encoding issues
  url: z.string().min(1),
  externalApplyLink: z.string().optional().nullable(),
  postingDateParsed: z.string().optional().nullable(),
  postedAt: z.string().optional().nullable(),
  jobType: z.array(z.string()).optional().nullable(),
  salary: z.string().optional().nullable(),
});

export type RawIndeedJobType = z.infer<typeof RawIndeedJobSchema>;

// Schema for normalized job (common format)
export const NormalizedJobSchema = z.object({
  externalId: z.string(),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string(),
  description: z.string(),
  url: z.string(), // Lenient - URLs from scrapers may have various formats
  applicationUrl: z.string().optional(),
  postedAt: z.string().optional(),
  jobType: z.string().optional(),
  salary: z.string().optional(),
  source: z.enum(['indeed', 'linkedin', 'arbetsformedlingen']),
  rawData: z.record(z.unknown()),
});

export type NormalizedJobType = z.infer<typeof NormalizedJobSchema>;

// Schema for AI job evaluation response
export const JobEvaluationResultSchema = z.object({
  isValid: z.boolean(),
  score: z.number().min(0).max(100),
  category: z.string(),
  experience: z.string(),
  experience_logic: z.string(),
  reasoning: z.string(),
  applicationEmail: z.string(),
  duration: z.string(),
});

export type JobEvaluationResultType = z.infer<typeof JobEvaluationResultSchema>;

// Schema for scraper run request
export const ScraperRunRequestSchema = z.object({
  keywords: z.string().optional(),
  exclusionKeywords: z.array(z.string()).optional(),
  country: z.string().optional().default('SE'),
  maxItems: z.number().min(1).max(500).optional().default(50),
});

export type ScraperRunRequestType = z.infer<typeof ScraperRunRequestSchema>;

// Schema for raw LinkedIn job from Apify
// Note: Using lenient validation because Apify can return various formats
export const RawLinkedInJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  companyName: z.string(),
  location: z.string().optional().nullable().default(''),
  descriptionText: z.string().optional().nullable().default(''),
  link: z.string().min(1),
  employmentType: z.string().optional().nullable(),
  salaryInfo: z.array(z.string()).optional().nullable(),
  postedAt: z.string().optional().nullable(),
  seniorityLevel: z.string().optional().nullable(),
  jobPosterName: z.string().optional().nullable(),
  jobPosterTitle: z.string().optional().nullable(),
  jobPosterProfileUrl: z.string().optional().nullable(),
  companyLinkedinUrl: z.string().optional().nullable(),
  companyWebsite: z.string().optional().nullable(),
  companyDescription: z.string().optional().nullable(),
  companyEmployeesCount: z.number().optional().nullable(),
  applyUrl: z.string().optional().nullable(),
});

export type RawLinkedInJobType = z.infer<typeof RawLinkedInJobSchema>;

// Schema for raw Arbetsformedlingen job from JobTech API
// Note: Using lenient validation because the public API may return partial data
export const RawAFJobSchema = z.object({
  id: z.string(),
  external_id: z.string().optional().nullable(),
  headline: z.string(),
  employer: z.object({ name: z.string() }),
  workplace_address: z
    .object({
      municipality: z.string().optional().nullable(),
      region: z.string().optional().nullable(),
      country: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  description: z
    .object({
      text: z.string().optional().nullable(),
      text_formatted: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  webpage_url: z.string().min(1),
  application_details: z
    .object({
      url: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  publication_date: z.string().optional().nullable(),
  application_deadline: z.string().optional().nullable(),
  employment_type: z.object({ label: z.string().optional().nullable() }).optional().nullable(),
  salary_type: z.object({ label: z.string().optional().nullable() }).optional().nullable(),
  duration: z.object({ label: z.string().optional().nullable() }).optional().nullable(),
  number_of_vacancies: z.number().optional().nullable(),
  removed: z.boolean().optional().nullable(),
});

export type RawAFJobType = z.infer<typeof RawAFJobSchema>;

// Validation helpers
export function parseRawIndeedJobs(data: unknown[]): z.infer<typeof RawIndeedJobSchema>[] {
  const results: z.infer<typeof RawIndeedJobSchema>[] = [];

  for (const item of data) {
    const parsed = RawIndeedJobSchema.safeParse(item);
    if (parsed.success) {
      results.push(parsed.data);
    }
  }

  logger.debug('Parsed raw Indeed jobs', { parsed: results.length, total: data.length });

  return results;
}

export function parseRawLinkedInJobs(data: unknown[]): z.infer<typeof RawLinkedInJobSchema>[] {
  const results: z.infer<typeof RawLinkedInJobSchema>[] = [];

  for (const item of data) {
    const parsed = RawLinkedInJobSchema.safeParse(item);
    if (parsed.success) {
      results.push(parsed.data);
    }
  }

  logger.debug('Parsed raw LinkedIn jobs', { parsed: results.length, total: data.length });

  return results;
}

export function parseRawAFJobs(data: unknown[]): z.infer<typeof RawAFJobSchema>[] {
  const results: z.infer<typeof RawAFJobSchema>[] = [];

  for (const item of data) {
    const parsed = RawAFJobSchema.safeParse(item);
    if (parsed.success) {
      results.push(parsed.data);
    }
  }

  logger.debug('Parsed raw AF jobs', { parsed: results.length, total: data.length });

  return results;
}

// ─── Google Maps Lead Scraper Schemas ───

// Schema for individual enrichment lead from Apify
const GoogleMapsLeadSchema = z.object({
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  fullName: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  headline: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  linkedinProfile: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  departments: z.array(z.string()).optional().nullable(),
  seniority: z.string().optional().nullable(),
  mobileNumber: z.string().optional().nullable(),
});

// Schema for raw Google Maps place from Apify
// Note: Using lenient validation because Apify can return various formats
export const RawGoogleMapsPlaceSchema = z.object({
  title: z.string().min(1),
  website: z.string().optional().nullable(),
  categoryName: z.string().optional().nullable(),
  placeId: z.string().min(1),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  countryCode: z.string().optional().nullable(),
  reviewsCount: z.number().optional().nullable(),
  phone: z.string().optional().nullable(),
  phoneUnformatted: z.string().optional().nullable(),
  totalScore: z.number().optional().nullable(),
  leadsEnrichment: z.array(GoogleMapsLeadSchema).optional().nullable(),
});

export type RawGoogleMapsPlaceType = z.infer<typeof RawGoogleMapsPlaceSchema>;

// Schema for AI company evaluation response
export const CompanyEvaluationResultSchema = z.object({
  isValid: z.boolean(),
  score: z.number().min(0).max(100),
  reasoning: z.string(),
  industry_category: z.string(),
  size_estimate: z.string(),
});

export type CompanyEvaluationResultType = z.infer<typeof CompanyEvaluationResultSchema>;

// Schema for lead scraper run request
export const LeadScraperRunRequestSchema = z.object({
  searchQueries: z.array(z.string().min(1)).optional(),
  maxItemsPerQuery: z.number().min(1).max(200).optional().default(50),
  countryFilter: z.string().optional().default('SE'),
});

export type LeadScraperRunRequestType = z.infer<typeof LeadScraperRunRequestSchema>;

// Validation helper for raw Google Maps places
export function parseRawGoogleMapsPlaces(data: unknown[]): z.infer<typeof RawGoogleMapsPlaceSchema>[] {
  const results: z.infer<typeof RawGoogleMapsPlaceSchema>[] = [];

  for (const item of data) {
    const parsed = RawGoogleMapsPlaceSchema.safeParse(item);
    if (parsed.success) {
      results.push(parsed.data);
    }
  }

  logger.debug('Parsed raw Google Maps places', { parsed: results.length, total: data.length });

  return results;
}

