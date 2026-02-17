import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { logger, getErrorMessage, maskEmail } from '../utils/logger.js';
import type {
  FormData,
  AIScoreResult,
  ContactData,
  JobAdWithCompanyId,
  SignalRecord,
  RejectedLeadRecord,
  ContactRecord,
  JobAdRecord,
} from '../types/index.js';

if (!config.supabase.key) {
  throw new Error('SUPABASE_KEY is required');
}

const supabase = createClient(config.supabase.url, config.supabase.key);

/**
 * Calls the find_or_create_company stored procedure
 * Replicates the "Find or Create Company in Supabase" HTTP node
 */
export async function findOrCreateCompany(
  companyName: string,
  domain: string | null,
  source: string = 'website_form'
): Promise<string> {
  try {
    logger.info('Finding or creating company', { companyName, domain });

    const { data, error } = await supabase.rpc('find_or_create_company', {
      p_name: companyName,
      p_domain: domain,
      p_source: source,
    });

    if (error) {
      throw error;
    }

    logger.info('Company found/created', { company_id: data });

    return data as string; // Returns the company_id
  } catch (error) {
    logger.error('Error finding/creating company', error);
    throw new Error(`Failed to find/create company: ${getErrorMessage(error)}`);
  }
}

/**
 * Creates a signal record in the scraping_signals table
 * Replicates the "Create Signal for Form Submission" node
 */
export async function createSignal(
  companyId: string,
  payload: Record<string, unknown>
): Promise<SignalRecord> {
  try {
    logger.info('Creating signal', { companyId });

    const { data, error } = await supabase
      .from('scraping_signals')
      .insert({
        company_id: companyId,
        signal_type: 'website_form_submission',
        source: 'website_form',
        payload: payload,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info('Signal created', { signalId: data.id });

    return data as SignalRecord;
  } catch (error) {
    logger.error('Error creating signal', error);
    throw new Error(`Failed to create signal: ${getErrorMessage(error)}`);
  }
}

/**
 * Inserts a rejected lead into scraping_rejected_leads table
 * Consolidated function for spam, invalid, and error cases
 */
export async function insertRejectedLead(
  leadData: FormData,
  classification: string = 'likely_spam',
  aiReasoning: string = 'N/A (Fast Reject)'
): Promise<RejectedLeadRecord> {
  try {
    logger.info('Inserting rejected lead', { email: maskEmail(leadData.email), classification });

    const { data, error } = await supabase
      .from('scraping_rejected_leads')
      .insert({
        full_name: leadData.full_name,
        email: leadData.email,
        phone: leadData.phone,
        company_name: leadData.company_name,
        submitted_description: leadData.needs_description,
        source: 'website_form',
        classification,
        ai_reasoning: aiReasoning,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info('Rejected lead inserted', { leadId: data.id, classification });

    return data as RejectedLeadRecord;
  } catch (error) {
    logger.error('Error inserting rejected lead', error);
    throw new Error(`Failed to insert rejected lead: ${getErrorMessage(error)}`);
  }
}


/**
 * Upserts a contact record
 * Replicates "Upsert Contacts with Email" HTTP node
 * Uses on_conflict=company_id,email with merge-duplicates
 */
export async function upsertContact(contactData: ContactData): Promise<ContactRecord> {
  try {
    logger.info('Upserting contact', { email: maskEmail(contactData.email) });

    const { data, error } = await supabase
      .from('contacts')
      .upsert(contactData, {
        onConflict: 'company_id,email',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info('Contact upserted', { contactId: data.id });

    return data as ContactRecord;
  } catch (error) {
    logger.error('Error upserting contact', error);
    throw new Error(`Failed to upsert contact: ${getErrorMessage(error)}`);
  }
}

/**
 * Creates a job ad record in jobs table
 * Replicates "Create Job Ad Record" node
 */
export async function createJobAdRecord(
  jobAdData: JobAdWithCompanyId,
  formData: FormData,
  aiData: AIScoreResult
): Promise<JobAdRecord> {
  try {
    logger.info('Creating job ad record', { title: jobAdData.title });

    const now = Date.now().toString();

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        company_id: jobAdData.company_id,
        title: jobAdData.title,
        description: jobAdData.description,
        source: 'website_form',
        external_id: formData.id || now,
        published_status: 'draft',
        ai_valid: true,
        ai_score: aiData.lead_score,
        ai_reasoning: aiData.ai_reasoning,
        ai_category: aiData.role_category,
        raw_data: formData,
        service_type: formData.service_type,
        is_ai_generated: true,
        location: jobAdData.location,
        external_url: jobAdData.external_url,
        posted_date: jobAdData.posted_date,
        category: jobAdData.category,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info('Job ad record created', { jobId: data.id });

    return data as JobAdRecord;
  } catch (error) {
    logger.error('Error creating job ad record', error);
    throw new Error(`Failed to create job ad record: ${getErrorMessage(error)}`);
  }
}

/**
 * Creates a client access request for the admin portal approval flow.
 * Called when a valid lead submits the website form.
 * Returns the created request ID (used for notification href), or null on failure.
 */
export async function createClientAccessRequest(
  formData: FormData
): Promise<string | null> {
  try {
    const nameParts = (formData.full_name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const { data, error } = await supabase
      .from('client_access_requests')
      .insert({
        email: formData.email || '',
        first_name: firstName,
        last_name: lastName,
        company_name: formData.company_name || '',
        phone: formData.phone || null,
        message: formData.needs_description || null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    logger.info('Client access request created', { requestId: data.id });
    return data.id as string;
  } catch (error) {
    logger.error('Error creating client access request', error);
    return null;
  }
}

/**
 * Creates an in-app notification for all admin users.
 * Fire-and-forget — never throws, never blocks the caller.
 */
export async function notifyAdmins(
  category: string,
  title: string,
  body: string,
  href?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    // Select user_id (FK to auth.users), not id (user_profiles PK)
    // notifications.user_id references auth.users.id
    const { data: admins, error: adminError } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('role', 'admin');

    if (adminError || !admins?.length) {
      logger.warn('No admin users found for notification', { error: adminError?.message });
      return;
    }

    const notifications = admins.map((admin) => ({
      user_id: admin.user_id,
      category,
      title,
      body,
      href: href || null,
      metadata: metadata || {},
    }));

    const { error } = await supabase.from('notifications').insert(notifications);

    if (error) {
      throw error;
    }

    logger.info('Admin notifications created', { count: admins.length, category });
  } catch (error) {
    logger.error('Error creating admin notification', error);
  }
}

// ============================================================================
// SCRAPER-SPECIFIC OPERATIONS
// ============================================================================

import type {
  NormalizedJob,
  JobEvaluationResult,
  ExtractedContact,
  JobScraperSource,
  GoogleMapsLead,
} from '../types/scraper.types.js';

/**
 * Find existing jobs by external_id or url for deduplication
 */
export async function findExistingJobsBySource(
  source: JobScraperSource
): Promise<Set<string>> {
  try {
    logger.info('Fetching existing jobs for deduplication', { source });

    const { data, error } = await supabase
      .from('jobs')
      .select('external_id, external_url')
      .eq('source', source);

    if (error) {
      throw error;
    }

    // Create a set of external_ids and urls for fast lookup
    const existingIds = new Set<string>();
    for (const job of data || []) {
      if (job.external_id) existingIds.add(job.external_id);
      if (job.external_url) existingIds.add(job.external_url);
    }

    logger.info('Fetched existing jobs', { source, count: existingIds.size });

    return existingIds;
  } catch (error) {
    logger.error('Error fetching existing jobs', error);
    throw new Error(`Failed to fetch existing jobs: ${getErrorMessage(error)}`);
  }
}

/**
 * Create a job ad record from a scraped job
 */
export async function createJobAdFromScraper(
  job: NormalizedJob,
  companyId: string,
  evaluation: JobEvaluationResult
): Promise<{ id: string; company_id: string }> {
  try {
    logger.info('Creating job ad from scraper', { title: job.title, source: job.source });

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        company_id: companyId,
        title: job.title,
        description: job.description,
        source: job.source,
        external_id: job.externalId,
        external_url: job.url,
        location: job.location,
        job_type: job.jobType,
        posted_date: job.postedAt,
        salary: job.salary,
        ai_valid: evaluation.isValid,
        ai_score: evaluation.score,
        ai_reasoning: evaluation.reasoning,
        ai_category: evaluation.category,
        ai_experience: evaluation.experience,
        application_email: evaluation.applicationEmail !== 'Email Not Found' ? evaluation.applicationEmail : null,
        duration: evaluation.duration,
        raw_data: job.rawData,
        is_ai_generated: false,
        published_status: 'scraped',
      })
      .select('id, company_id')
      .single();

    if (error) {
      logger.error('Supabase insert error', { code: error.code, message: error.message, details: error.details });
      throw error;
    }

    logger.info('Job ad created from scraper', { jobId: data.id, source: job.source });

    return data;
  } catch (error) {
    logger.error('Error creating job ad from scraper', error);
    throw new Error(`Failed to create job ad from scraper: ${getErrorMessage(error)}`);
  }
}

/**
 * Create a signal for a scraped job ad
 */
export async function createSignalForJobAd(
  companyId: string,
  jobAdId: string,
  job: NormalizedJob,
  evaluation: JobEvaluationResult
): Promise<{ id: string }> {
  try {
    logger.info('Creating signal for job ad', { companyId, jobAdId, source: job.source });

    const signalType = `${job.source}_job_ad`;

    const { data, error } = await supabase
      .from('scraping_signals')
      .insert({
        company_id: companyId,
        signal_type: signalType,
        source: job.source,
        signal_date: job.postedAt ? new Date(job.postedAt).toISOString() : new Date().toISOString(),
        payload: {
          job_ad_id: jobAdId,
          title: job.title,
          score: evaluation.score,
          valid: evaluation.isValid,
          company: job.company,
          location: job.location,
          description: job.description?.substring(0, 500),
          url: job.url,
          duration: evaluation.duration,
          applicationEmail: evaluation.applicationEmail,
          reasoning: evaluation.reasoning,
        },
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    logger.info('Signal created for job ad', { signalId: data.id });

    return data;
  } catch (error) {
    logger.error('Error creating signal for job ad', error);
    throw new Error(`Failed to create signal for job ad: ${getErrorMessage(error)}`);
  }
}

// Generic email prefixes that should not be used as contact names.
// When the AI or fallback code derives a name from e.g. "info@company.se",
// we get "Info" as full_name — these have zero outreach value.
const GENERIC_EMAIL_PREFIXES = new Set([
  'info', 'hr', 'hello', 'hej', 'jobb', 'jobs', 'job', 'kansli', 'work',
  'kontakt', 'contact', 'reception', 'office', 'admin', 'support', 'career',
  'careers', 'rekrytering', 'recruiting', 'recruitment', 'personal',
  'ekonomi', 'faktura', 'invoice', 'order', 'sales', 'mail', 'post',
  'service', 'kundtjanst', 'kundservice', 'application', 'apply',
]);

/**
 * Check if a contact name is a generic email prefix (not a real person's name).
 * Returns true if the name should be cleared.
 */
function isGenericContactName(name: string | undefined): boolean {
  if (!name) return false;
  return GENERIC_EMAIL_PREFIXES.has(name.toLowerCase().trim());
}

/**
 * Upsert a contact extracted from a scraped job
 */
export async function upsertScrapedContact(contact: ExtractedContact): Promise<{ id: string } | null> {
  try {
    // Skip if no email
    if (!contact.email) {
      return null;
    }

    // Split comma-separated emails into separate contact records
    const emails = contact.email
      .split(',')
      .map((e) => e.toLowerCase().trim())
      .filter((e) => e.length > 0 && e.includes('@'));

    if (emails.length === 0) {
      return null;
    }

    if (emails.length > 1) {
      logger.info('Splitting multi-email contact into separate records', {
        count: emails.length,
        companyId: contact.companyId,
      });
    }

    // Clear name fields if they match a generic email prefix (e.g. "Info", "Hr")
    let { firstName, lastName, fullName } = contact;
    if (isGenericContactName(fullName)) {
      logger.info('Clearing generic contact name', { fullName, companyId: contact.companyId });
      firstName = undefined;
      lastName = undefined;
      fullName = undefined;
    }

    let firstResult: { id: string } | null = null;

    for (const email of emails) {
      logger.info('Upserting scraped contact', { email: maskEmail(email) });

      // Protect api_extracted from being downgraded to ai_extracted
      if (contact.sourceMethod === 'ai_extracted') {
        const { data: existing } = await supabase
          .from('contacts')
          .select('source_method')
          .eq('company_id', contact.companyId)
          .eq('email', email)
          .maybeSingle();

        if (existing?.source_method === 'api_extracted') {
          logger.info('Preserving api_extracted, skipping ai_extracted overwrite', {
            email: maskEmail(email),
            companyId: contact.companyId,
          });
          continue;
        }
      }

      const { data, error } = await supabase
        .from('contacts')
        .upsert(
          {
            company_id: contact.companyId,
            first_name: firstName ?? null,
            last_name: lastName ?? null,
            full_name: fullName ?? null,
            title: contact.title,
            email,
            linkedin_url: contact.linkedinUrl,
            source: contact.source,
            source_method: contact.sourceMethod,
            related_job_ad_id: contact.relatedJobAdId,
          },
          {
            onConflict: 'company_id,email',
            ignoreDuplicates: false,
          }
        )
        .select('id')
        .single();

      if (error) {
        // Ignore unique constraint violations (duplicate contacts)
        if (error.code === '23505') {
          logger.debug('Contact already exists, skipping', { email: maskEmail(email) });
          continue;
        }
        throw error;
      }

      logger.info('Scraped contact upserted', { contactId: data.id });

      if (!firstResult) {
        firstResult = data;
      }
    }

    return firstResult;
  } catch (error) {
    logger.error('Error upserting scraped contact', error);
    // Don't throw - contact upsert failures shouldn't break the pipeline
    return null;
  }
}

/**
 * Update company with LinkedIn enrichment data
 * Only fills fields that are currently null in the DB (never overwrites existing data)
 * Non-throwing: enrichment is best-effort
 */
export async function updateCompanyEnrichment(
  companyId: string,
  data: {
    linkedinUrl?: string | null;
    website?: string | null;
    description?: string | null;
    employeeCount?: number | null;
  }
): Promise<void> {
  try {
    // Fetch current company to check which fields are null
    const { data: company, error: fetchError } = await supabase
      .from('companies')
      .select('linkedin_url, website, description, employee_count, company_size')
      .eq('id', companyId)
      .single();

    if (fetchError || !company) {
      logger.error('Failed to fetch company for enrichment', fetchError, { companyId });
      return;
    }

    // Build update object: only set fields that are currently null and have incoming values
    const updates: Record<string, unknown> = {};

    if (!company.linkedin_url && data.linkedinUrl) {
      updates.linkedin_url = data.linkedinUrl;
    }
    if (!company.website && data.website) {
      updates.website = data.website;
    }
    if (!company.description && data.description) {
      updates.description = data.description;
    }
    if (!company.employee_count && data.employeeCount) {
      updates.employee_count = data.employeeCount;
    }
    if (!company.company_size && data.employeeCount) {
      updates.company_size = String(data.employeeCount);
    }

    if (Object.keys(updates).length === 0) {
      logger.debug('No enrichment updates needed', { companyId });
      return;
    }

    updates.updated_at = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', companyId);

    if (updateError) {
      logger.error('Failed to update company enrichment', updateError, { companyId });
      return;
    }

    logger.info('Company enriched with LinkedIn data', {
      companyId,
      fieldsUpdated: Object.keys(updates).filter((k) => k !== 'updated_at'),
    });
  } catch (error) {
    logger.error('Error in company enrichment', error, { companyId });
  }
}

/**
 * Upsert a LinkedIn contact (has linkedin_url but may not have email)
 * Uses on_conflict=company_id,linkedin_url
 */
export async function upsertLinkedInContact(contact: ExtractedContact): Promise<{ id: string } | null> {
  try {
    if (!contact.linkedinUrl) {
      return null;
    }

    logger.info('Upserting LinkedIn contact', { linkedinUrl: contact.linkedinUrl });

    const { data, error } = await supabase
      .from('contacts')
      .upsert(
        {
          company_id: contact.companyId,
          first_name: contact.firstName,
          last_name: contact.lastName,
          full_name: contact.fullName,
          title: contact.title,
          linkedin_url: contact.linkedinUrl,
          source: contact.source,
          source_method: contact.sourceMethod,
          related_job_ad_id: contact.relatedJobAdId,
        },
        {
          onConflict: 'company_id,linkedin_url',
          ignoreDuplicates: false,
        }
      )
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        logger.debug('LinkedIn contact already exists, skipping', { linkedinUrl: contact.linkedinUrl });
        return null;
      }
      throw error;
    }

    logger.info('LinkedIn contact upserted', { contactId: data.id });

    return data;
  } catch (error) {
    logger.error('Error upserting LinkedIn contact', error);
    // Don't throw - contact upsert failures shouldn't break the pipeline
    return null;
  }
}

/**
 * Delete old jobs by source (cleanup)
 */
export async function deleteOldJobsBySource(
  source: JobScraperSource,
  olderThanDays: number
): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    logger.info('Deleting old jobs', { source, olderThanDays, cutoffDate: cutoffDate.toISOString() });

    const { data, error } = await supabase
      .from('jobs')
      .delete()
      .eq('source', source)
      .lt('posted_date', cutoffDate.toISOString().split('T')[0])
      .select('id');

    if (error) {
      throw error;
    }

    const deletedCount = data?.length || 0;
    logger.info('Old jobs deleted', { source, deletedCount });

    return deletedCount;
  } catch (error) {
    logger.error('Error deleting old jobs', error);
    throw new Error(`Failed to delete old jobs: ${getErrorMessage(error)}`);
  }
}

// ============================================================================
// GOOGLE MAPS LEAD SCRAPER OPERATIONS
// ============================================================================

/**
 * Update company with AI scoring results from Google Maps evaluation.
 * Always overwrites — each scrape run produces a fresh evaluation.
 */
export async function updateCompanyScore(
  companyId: string,
  score: number,
  industry: string,
  aiReasoning: string
): Promise<void> {
  try {
    logger.info('Updating company score', { companyId, score, industry });

    const { error } = await supabase
      .from('companies')
      .update({
        current_score: score,
        industry,
        ai_reasoning: aiReasoning,
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId);

    if (error) {
      throw error;
    }

    logger.info('Company score updated', { companyId, score });
  } catch (error) {
    logger.error('Error updating company score', error);
    throw new Error(`Failed to update company score: ${getErrorMessage(error)}`);
  }
}

/**
 * Create a signal for a Google Maps listing.
 * signal_type: 'google_maps_listing', source: 'google_maps'
 */
export async function createGoogleMapsSignal(
  companyId: string,
  payload: Record<string, unknown>
): Promise<{ id: string }> {
  try {
    logger.info('Creating Google Maps signal', { companyId });

    const { data, error } = await supabase
      .from('scraping_signals')
      .insert({
        company_id: companyId,
        signal_type: 'google_maps_listing',
        source: 'google_maps',
        signal_date: new Date().toISOString(),
        payload,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    logger.info('Google Maps signal created', { signalId: data.id });

    return data;
  } catch (error) {
    logger.error('Error creating Google Maps signal', error);
    throw new Error(`Failed to create Google Maps signal: ${getErrorMessage(error)}`);
  }
}

/**
 * Upsert a contact from Google Maps leadsEnrichment data.
 * Routes to upsertScrapedContact (if email) or upsertLinkedInContact (if linkedin only).
 */
export async function upsertGoogleMapsContact(
  companyId: string,
  lead: GoogleMapsLead
): Promise<{ id: string } | null> {
  const contact: ExtractedContact = {
    companyId,
    firstName: lead.firstName || undefined,
    lastName: lead.lastName || undefined,
    fullName: lead.fullName || undefined,
    title: lead.jobTitle || lead.headline || undefined,
    email: lead.email?.toLowerCase().trim() || undefined,
    linkedinUrl: lead.linkedinProfile || undefined,
    source: 'google_maps',
    sourceMethod: 'api_extracted',
  };

  // Prefer email-based upsert (stronger dedup key), fall back to linkedin
  if (contact.email) {
    return upsertScrapedContact(contact);
  }

  if (contact.linkedinUrl) {
    return upsertLinkedInContact(contact);
  }

  logger.debug('Skipping Google Maps contact with no email or LinkedIn', {
    name: lead.fullName,
  });
  return null;
}

// ============================================================================
// ADMIN DATA ENDPOINTS — READ-ONLY QUERIES
// ============================================================================

/**
 * Fetch jobs with optional filters. Includes company name via join.
 */
export async function getJobs(filters: {
  source?: string;
  ai_valid?: boolean;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: Record<string, unknown>[]; count: number }> {
  try {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    let query = supabase
      .from('jobs')
      .select(
        'id, title, source, location, ai_valid, ai_score, ai_category, ai_experience, posted_date, external_url, application_email, salary, duration, published_status, is_ai_generated, created_at, company_id, companies(id, name, domain)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.source) {
      query = query.eq('source', filters.source);
    }
    if (filters.ai_valid !== undefined) {
      query = query.eq('ai_valid', filters.ai_valid);
    }
    if (filters.from_date) {
      query = query.gte('posted_date', filters.from_date);
    }
    if (filters.to_date) {
      query = query.lte('posted_date', filters.to_date);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return { data: (data || []) as Record<string, unknown>[], count: count ?? 0 };
  } catch (error) {
    logger.error('Error fetching jobs', error);
    throw new Error(`Failed to fetch jobs: ${getErrorMessage(error)}`);
  }
}

/**
 * Fetch a single job by ID with full details including company.
 */
export async function getJobById(
  jobId: string
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select(
        '*, companies(id, name, domain, industry, current_score, website)'
      )
      .eq('id', jobId)
      .maybeSingle();

    if (error) throw error;

    return data as Record<string, unknown> | null;
  } catch (error) {
    logger.error('Error fetching job by ID', error);
    throw new Error(`Failed to fetch job: ${getErrorMessage(error)}`);
  }
}

/**
 * Fetch companies with related counts (jobs, signals, contacts).
 * Supabase doesn't support COUNT on nested relations directly,
 * so we fetch the IDs and count client-side for simplicity.
 */
export async function getCompanies(filters: {
  status?: string;
  source?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: Record<string, unknown>[]; count: number }> {
  try {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const { data, error, count } = await supabase
      .from('companies')
      .select(
        'id, name, domain, industry, region, current_score, status, source, website, linkedin_url, employee_count, company_size, enrichment_status, created_at, updated_at, jobs(id), scraping_signals(id), contacts(id)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Transform nested arrays to counts
    const transformed = (data || []).map((company: Record<string, unknown>) => {
      const { jobs, scraping_signals, contacts, ...rest } = company;
      return {
        ...rest,
        job_count: Array.isArray(jobs) ? jobs.length : 0,
        signal_count: Array.isArray(scraping_signals) ? scraping_signals.length : 0,
        contact_count: Array.isArray(contacts) ? contacts.length : 0,
      };
    });

    return { data: transformed, count: count ?? 0 };
  } catch (error) {
    logger.error('Error fetching companies', error);
    throw new Error(`Failed to fetch companies: ${getErrorMessage(error)}`);
  }
}

/**
 * Fetch a single company by ID with all related data.
 */
export async function getCompanyById(
  companyId: string
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select(
        '*, jobs(id, title, source, location, ai_valid, ai_score, ai_category, posted_date, external_url, created_at), scraping_signals(id, signal_type, source, signal_date, captured_at, payload), contacts(id, full_name, email, phone, title, linkedin_url, source, source_method, created_at)'
      )
      .eq('id', companyId)
      .maybeSingle();

    if (error) throw error;

    return data as Record<string, unknown> | null;
  } catch (error) {
    logger.error('Error fetching company by ID', error);
    throw new Error(`Failed to fetch company: ${getErrorMessage(error)}`);
  }
}

/**
 * Fetch contacts with company name. Filterable by source and source_method.
 */
export async function getContacts(filters: {
  source?: string;
  source_method?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: Record<string, unknown>[]; count: number }> {
  try {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    let query = supabase
      .from('contacts')
      .select(
        'id, full_name, first_name, last_name, email, phone, title, linkedin_url, source, source_method, department, seniority, created_at, company_id, companies(id, name, domain)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.source) {
      query = query.eq('source', filters.source);
    }
    if (filters.source_method) {
      query = query.eq('source_method', filters.source_method);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return { data: (data || []) as Record<string, unknown>[], count: count ?? 0 };
  } catch (error) {
    logger.error('Error fetching contacts', error);
    throw new Error(`Failed to fetch contacts: ${getErrorMessage(error)}`);
  }
}

/**
 * Fetch scraping_signals with company name. Filterable by source and signal_type.
 */
export async function getSignals(filters: {
  source?: string;
  signal_type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: Record<string, unknown>[]; count: number }> {
  try {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    let query = supabase
      .from('scraping_signals')
      .select(
        'id, signal_type, source, signal_date, captured_at, expired_at, score_contribution, payload, company_id, companies(id, name, domain)',
        { count: 'exact' }
      )
      .order('captured_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.source) {
      query = query.eq('source', filters.source);
    }
    if (filters.signal_type) {
      query = query.eq('signal_type', filters.signal_type);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return { data: (data || []) as Record<string, unknown>[], count: count ?? 0 };
  } catch (error) {
    logger.error('Error fetching signals', error);
    throw new Error(`Failed to fetch signals: ${getErrorMessage(error)}`);
  }
}

/**
 * Dashboard summary: key numbers for an overview card.
 */
export async function getDashboardSummary(): Promise<Record<string, unknown>> {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weekCutoff = oneWeekAgo.toISOString();

    // Run all counts in parallel
    const [companies, jobs, contacts, signals, companiesWeek, jobsWeek, signalsWeek] =
      await Promise.all([
        supabase.from('companies').select('id', { count: 'exact', head: true }),
        supabase.from('jobs').select('id', { count: 'exact', head: true }),
        supabase.from('contacts').select('id', { count: 'exact', head: true }),
        supabase.from('scraping_signals').select('id', { count: 'exact', head: true }),
        supabase.from('companies').select('id', { count: 'exact', head: true }).gte('created_at', weekCutoff),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).gte('created_at', weekCutoff),
        supabase.from('scraping_signals').select('id', { count: 'exact', head: true }).gte('captured_at', weekCutoff),
      ]);

    return {
      total_companies: companies.count ?? 0,
      total_jobs: jobs.count ?? 0,
      total_contacts: contacts.count ?? 0,
      total_signals: signals.count ?? 0,
      companies_this_week: companiesWeek.count ?? 0,
      jobs_this_week: jobsWeek.count ?? 0,
      signals_this_week: signalsWeek.count ?? 0,
    };
  } catch (error) {
    logger.error('Error fetching dashboard summary', error);
    throw new Error(`Failed to fetch dashboard summary: ${getErrorMessage(error)}`);
  }
}

/**
 * Fetch system alerts with optional filters.
 * Default: last 7 days, limit 50, ordered by created_at DESC.
 */
export async function getAlerts(filters: {
  source?: string;
  severity?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: Record<string, unknown>[]; count: number }> {
  try {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const defaultFrom = new Date();
    defaultFrom.setDate(defaultFrom.getDate() - 7);

    let query = supabase
      .from('system_alerts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.source) {
      query = query.eq('source', filters.source);
    }
    if (filters.severity) {
      query = query.eq('severity', filters.severity);
    }

    const fromDate = filters.from_date || defaultFrom.toISOString();
    query = query.gte('created_at', fromDate);

    if (filters.to_date) {
      query = query.lte('created_at', filters.to_date);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return { data: (data || []) as Record<string, unknown>[], count: count ?? 0 };
  } catch (error) {
    logger.error('Error fetching system alerts', error);
    throw new Error(`Failed to fetch system alerts: ${getErrorMessage(error)}`);
  }
}
