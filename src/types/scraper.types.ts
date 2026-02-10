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
