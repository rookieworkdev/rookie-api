// Form submission data from webhook - validated by zod schema
export { WebhookRequestBody } from '../schemas/webhook.js';

// Structured form data after initial processing
export interface FormData {
  id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  industry?: string;
  service_type?: string;
  needs_description?: string;
  subject?: string;
  experience?: string;
}

// Validation details from lead validation
export interface ValidationDetails {
  email_valid: boolean;
  phone_valid: boolean;
  company_filled: boolean;
  needs_description_length: number;
  needs_adequate: boolean;
  contact_name_filled: boolean;
}

// Lead data after validation
export interface ValidatedLead extends FormData {
  validation_score: number;
  is_likely_spam: boolean;
  validation_details: ValidationDetails;
}

// Classification types from AI scoring
export type LeadClassification = 'valid_lead' | 'invalid_lead' | 'likely_candidate' | 'likely_spam';

// AI scoring response
export interface AIScoreResult {
  lead_score: number;
  role_category: string;
  classification: LeadClassification;
  key_requirements: string[];
  ai_reasoning: string;
}

// Data after domain extraction
export interface DataWithDomain extends ValidatedLead, AIScoreResult {
  extracted_domain: string | null;
  domain_source: 'email' | 'guessed' | 'none';
}

// Normalized company data for database operations
export interface NormalizedCompanyData {
  company_id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  industry?: string;
  needs_description?: string;
  lead_score: number;
  role_category: string;
  key_requirements: string[];
  ai_reasoning: string;
  classification: LeadClassification;
}

// Contact data for upsert
export interface ContactData {
  company_id: string;
  full_name?: string;
  email: string;
  phone?: string;
  source: string;
}

// Job ad data from AI generation
export interface JobAdData {
  title: string;
  description: string;
  location: string;
  category: string;
  external_url: string;
  posted_date: string;
}

// Job ad data with company ID for database
export interface JobAdWithCompanyId extends JobAdData {
  company_id: string;
}

// Supabase response types
export interface SignalRecord {
  id: string;
  company_id: string;
  signal_type: string;
  source: string;
  payload: Record<string, unknown>;
}

export interface RejectedLeadRecord {
  id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  submitted_description?: string;
  source: string;
  classification: string;
  ai_reasoning?: string;
}

export interface CandidateLeadRecord {
  id: string;
  source: string;
  full_name?: string;
  email?: string;
  phone?: string;
  submitted_description?: string;
  ai_reasoning?: string;
}

export interface ContactRecord {
  id: string;
  company_id: string;
  full_name?: string;
  email: string;
  phone?: string;
  source: string;
}

export interface JobAdRecord {
  id: string;
  company_id: string;
  title: string;
  description: string;
  source: string;
  external_id: string;
  published_status: string;
  ai_valid: boolean;
  ai_score: number;
  ai_reasoning: string;
  ai_category: string;
  raw_data: FormData;
  service_type?: string;
  is_ai_generated: boolean;
  location: string;
  external_url: string;
  posted_date: string;
  category: string;
}

// Config types
export interface Config {
  port: number | string;
  nodeEnv: string;
  openai: {
    apiKey: string | undefined;
    model: string;
    temperature: number;
  };
  openRouter: {
    apiKey: string | undefined;
    primaryModel: string;
    fallbackModel: string;
  };
  supabase: {
    url: string;
    key: string | undefined;
  };
  resend: {
    apiKey: string | undefined;
    fromEmail: string;
  };
  adminAlert: {
    email: string | undefined;
  };
  webhook: {
    secret: string | undefined;
  };
  apify: {
    apiKey: string | undefined;
  };
  scraper: {
    apiKey: string | undefined;
    enabled: boolean;
    keywords: string;
    exclusionKeywords: string[];
    country: string;
    maxItems: number;
    retentionDays: number;
  };
}

// Logger meta type
export type LogMeta = Record<string, unknown>;

// Email response type
export interface EmailResponse {
  id: string;
}

// Webhook response types
export interface WebhookSuccessResponse {
  success: true;
  dryRun?: boolean;
  message: string;
  classification?: string;
  lead_score?: number;
  job_ad_title?: string;
  job_ad_description?: string;
  reason?: string;
  processingTime: number;
}
