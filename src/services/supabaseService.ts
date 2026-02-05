import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type {
  FormData,
  AIScoreResult,
  ContactData,
  JobAdWithCompanyId,
  SignalRecord,
  RejectedLeadRecord,
  CandidateLeadRecord,
  ContactRecord,
  JobAdRecord,
} from '../types/index.js';

const supabase = createClient(config.supabase.url, config.supabase.key || '');

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
    const err = error as Error;
    logger.error('Error finding/creating company', error);
    throw new Error(`Failed to find/create company: ${err.message}`);
  }
}

/**
 * Creates a signal record in the signals table
 * Replicates the "Create Signal for Form Submission" node
 */
export async function createSignal(
  companyId: string,
  payload: Record<string, unknown>
): Promise<SignalRecord> {
  try {
    logger.info('Creating signal', { companyId });

    const { data, error } = await supabase
      .from('signals')
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
    const err = error as Error;
    logger.error('Error creating signal', error);
    throw new Error(`Failed to create signal: ${err.message}`);
  }
}

/**
 * Inserts a rejected lead into rejected_leads table
 * Consolidated function for spam, invalid, and error cases
 */
export async function insertRejectedLead(
  leadData: FormData,
  classification: string = 'likely_spam',
  aiReasoning: string = 'N/A (Fast Reject)'
): Promise<RejectedLeadRecord> {
  try {
    logger.info('Inserting rejected lead', { email: leadData.email, classification });

    const { data, error } = await supabase
      .from('rejected_leads')
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
    const err = error as Error;
    logger.error('Error inserting rejected lead', error);
    throw new Error(`Failed to insert rejected lead: ${err.message}`);
  }
}

/**
 * Inserts a candidate lead into candidate_leads
 * Replicates "Insert Candidate Lead" node
 */
export async function insertCandidateLead(
  leadData: FormData,
  aiData: AIScoreResult
): Promise<CandidateLeadRecord> {
  try {
    logger.info('Inserting candidate lead', { email: leadData.email });

    const { data, error } = await supabase
      .from('candidate_leads')
      .insert({
        source: 'website_form',
        full_name: leadData.full_name,
        email: leadData.email,
        phone: leadData.phone,
        submitted_description: leadData.needs_description,
        ai_reasoning: aiData.ai_reasoning,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info('Candidate lead inserted', { leadId: data.id });

    return data as CandidateLeadRecord;
  } catch (error) {
    const err = error as Error;
    logger.error('Error inserting candidate lead', error);
    throw new Error(`Failed to insert candidate lead: ${err.message}`);
  }
}

/**
 * Upserts a contact record
 * Replicates "Upsert Contacts with Email" HTTP node
 * Uses on_conflict=company_id,email with merge-duplicates
 */
export async function upsertContact(contactData: ContactData): Promise<ContactRecord> {
  try {
    logger.info('Upserting contact', { email: contactData.email });

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
    const err = error as Error;
    logger.error('Error upserting contact', error);
    throw new Error(`Failed to upsert contact: ${err.message}`);
  }
}

/**
 * Creates a job ad record in website_jobs
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
      .from('website_jobs')
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
        company: jobAdData.company,
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
    const err = error as Error;
    logger.error('Error creating job ad record', error);
    throw new Error(`Failed to create job ad record: ${err.message}`);
  }
}
