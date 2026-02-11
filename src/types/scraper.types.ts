// Scraper types for job scraping and lead generation

// Scraper sources
export type JobScraperSource = 'indeed' | 'linkedin' | 'arbetsformedlingen';
export type LeadScraperSource = 'google_maps';
export type ScraperSource = JobScraperSource | LeadScraperSource;

// Raw job data from Apify Indeed scraper
export interface RawIndeedJob {
  id: string;
  positionName: string;
  company: string;
  location: string;
  description: string;
  url: string;
  externalApplyLink?: string;
  postingDateParsed?: string;
  postedAt?: string;
  jobType?: string[];
  salary?: string;
}

// Normalized job after transformation (common format for all scrapers)
export interface NormalizedJob {
  externalId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  applicationUrl?: string;
  postedAt?: string;
  jobType?: string;
  salary?: string;
  source: JobScraperSource;
  rawData: Record<string, unknown>;
}

// AI job evaluation response
export interface JobEvaluationResult {
  isValid: boolean;
  score: number;
  category: string;
  experience: string;
  experienceLogic: string;
  reasoning: string;
  applicationEmail: string;
  duration: string;
}

// Job processing result (after AI + DB operations)
export interface ProcessedJob {
  job: NormalizedJob;
  evaluation: JobEvaluationResult;
  companyId: string;
  jobAdId: string;
  signalId: string;
  success: boolean;
  error?: string;
}

// Scraper run configuration
export interface ScraperRunConfig {
  keywords?: string;
  exclusionKeywords?: string[];
  country?: string;
  maxItems?: number;
}

// Scraper run result
export interface ScraperRunResult {
  source: JobScraperSource;
  runId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  stats: {
    fetched: number;
    afterDedup: number;
    afterFilter: number;
    processed: number;
    valid: number;
    discarded: number;
    errors: number;
  };
  validJobs: ProcessedJob[];
  discardedJobs: ProcessedJob[];
  errors: Array<{ job?: NormalizedJob; error: string }>;
}

// Contact extracted from job
export interface ExtractedContact {
  companyId: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  title?: string;
  email?: string;
  linkedinUrl?: string;
  source: string;
  // 'api_extracted' = structured data from the source API (e.g. LinkedIn job poster profile)
  // 'ai_extracted'  = parsed by AI from job description text (e.g. application email)
  sourceMethod: 'api_extracted' | 'ai_extracted';
  relatedJobAdId?: string;
}

// Raw job data from Apify LinkedIn scraper
export interface RawLinkedInJob {
  id: string;
  title: string;
  companyName: string;
  location: string;
  descriptionText: string;
  link: string;
  employmentType?: string;
  salaryInfo?: string[];
  postedAt?: string;
  seniorityLevel?: string;
  jobPosterName?: string;
  jobPosterTitle?: string;
  jobPosterProfileUrl?: string;
  companyLinkedinUrl?: string;
  companyWebsite?: string;
  companyDescription?: string;
  companyEmployeesCount?: number;
  applyUrl?: string;
}

// LinkedIn search category configuration
export interface LinkedInSearchCategory {
  name: string;
  keywords: string;
  location: string;
}

// LinkedIn scraper config
export interface LinkedInScraperConfig {
  source: 'linkedin';
  apifyActorId: string;
  geoId: string;
  defaultMaxItemsPerCategory: number;
  categories: LinkedInSearchCategory[];
  fieldMapping: {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    url: string;
    postedAt: string;
    applicationUrl: string;
    jobType: string;
    salary: string;
  };
}

// Scraper config types
export interface IndeedScraperConfig {
  source: 'indeed';
  apifyActorId: string;
  defaultCountry: string;
  defaultMaxItems: number;
  fieldMapping: {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    url: string;
    postedAt: string;
    applicationUrl: string;
    jobType: string;
    salary: string;
  };
}

// Raw job data from Arbetsformedlingen JobTech API
export interface RawAFJob {
  id: string;
  external_id?: string;
  headline: string;
  employer: { name: string };
  workplace_address?: {
    municipality?: string;
    region?: string;
    country?: string;
  };
  description?: { text?: string; text_formatted?: string };
  webpage_url: string;
  application_details?: { url?: string; email?: string };
  publication_date?: string;
  application_deadline?: string;
  employment_type?: { label?: string };
  salary_type?: { label?: string };
  duration?: { label?: string };
  number_of_vacancies?: number;
  removed?: boolean;
}

// Arbetsformedlingen scraper config
export interface AFScraperConfig {
  source: 'arbetsformedlingen';
  apiBaseUrl: string;
  defaultLimit: number;
  defaultPublishedAfterDays: number;
  fieldMapping: {
    externalId: string;
    title: string;
    company: string;
    location: string;
    description: string;
    url: string;
    postedAt: string;
    applicationUrl: string;
    jobType: string;
    salary: string;
  };
}

// Email digest data
export interface ScraperDigestData {
  source: JobScraperSource;
  date: string;
  stats: ScraperRunResult['stats'];
  validJobs: ProcessedJob[];
  discardedJobs: ProcessedJob[];
  errors: ScraperRunResult['errors'];
  duration: number;
}

// ─── Google Maps Lead Scraper Types ───

// Individual enrichment lead from Apify's leadsEnrichment array
export interface GoogleMapsLead {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  jobTitle?: string;
  headline?: string;
  email?: string;
  linkedinProfile?: string;
  photoUrl?: string;
  departments?: string[];
  seniority?: string;
  mobileNumber?: string;
}

// Raw place data from Apify Google Maps actor (compass/crawler-google-places)
export interface RawGoogleMapsPlace {
  title: string;
  website?: string;
  categoryName?: string;
  placeId: string;
  address?: string;
  city?: string;
  countryCode?: string;
  reviewsCount?: number;
  phone?: string;
  phoneUnformatted?: string;
  totalScore?: number;
  leadsEnrichment?: GoogleMapsLead[];
}

// Normalized company after transformation (common format for lead processing)
export interface NormalizedGoogleMapsCompany {
  placeId: string;
  name: string;
  domain: string;
  website: string;
  category?: string;
  address?: string;
  city?: string;
  countryCode?: string;
  reviewsCount?: number;
  phone?: string;
  googleRating?: number;
  leads: GoogleMapsLead[];
  rawData: Record<string, unknown>;
}

// AI company evaluation response
export interface CompanyEvaluationResult {
  isValid: boolean;
  score: number;
  reasoning: string;
  industryCategory: string;
  sizeEstimate: string;
}

// Company processing result (after AI + DB operations)
export interface ProcessedCompany {
  company: NormalizedGoogleMapsCompany;
  evaluation: CompanyEvaluationResult;
  companyId: string;
  signalId: string;
  contactsCreated: number;
  success: boolean;
  error?: string;
}

// Lead scraper run result
export interface LeadScraperRunResult {
  source: LeadScraperSource;
  runId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  stats: {
    fetched: number;
    afterFilter: number;
    processed: number;
    valid: number;
    discarded: number;
    contactsCreated: number;
    errors: number;
  };
  validCompanies: ProcessedCompany[];
  discardedCompanies: ProcessedCompany[];
  errors: Array<{ company?: NormalizedGoogleMapsCompany; error: string }>;
}

// Google Maps scraper config
export interface GoogleMapsScraperConfig {
  source: 'google_maps';
  apifyActorId: string;
  defaultMaxItemsPerQuery: number;
  countryFilter: string;
  language: string;
  scrapeBusinessLeads: boolean;
  maximumLeadsEnrichmentRecords: number;
  leadsEnrichmentDepartments: string[];
  leadsSeniority: string[];
  defaultSearchQueries: string[];
}
