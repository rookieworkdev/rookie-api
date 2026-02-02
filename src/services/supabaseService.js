import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const supabase = createClient(config.supabase.url, config.supabase.key);

/**
 * Calls the find_or_create_company stored procedure
 * Replicates the "Find or Create Company in Supabase" HTTP node
 */
export async function findOrCreateCompany(companyName, domain, source = 'website_form') {
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

    return data; // Returns the company_id
  } catch (error) {
    logger.error('Error finding/creating company', error);
    throw new Error(`Failed to find/create company: ${error.message}`);
  }
}

/**
 * Creates a signal record in the signals table
 * Replicates the "Create Signal for Form Submission" node
 */
export async function createSignal(companyId, payload) {
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

    return data;
  } catch (error) {
    logger.error('Error creating signal', error);
    throw new Error(`Failed to create signal: ${error.message}`);
  }
}

/**
 * Inserts a spam lead into rejected_leads
 * Replicates "Insert Spam Lead" and "Insert Spam Lead - Fast Reject" nodes
 */
export async function insertSpamLead(leadData, aiReasoning = 'N/A (Fast Reject)') {
  try {
    logger.info('Inserting spam lead', { email: leadData.email });

    const { data, error } = await supabase
      .from('rejected_leads')
      .insert({
        full_name: leadData.full_name,
        email: leadData.email,
        phone: leadData.phone,
        company_name: leadData.company_name,
        submitted_description: leadData.needs_description,
        source: 'website_form',
        classification: 'likely_spam',
        ai_reasoning: aiReasoning,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info('Spam lead inserted', { leadId: data.id });

    return data;
  } catch (error) {
    logger.error('Error inserting spam lead', error);
    throw new Error(`Failed to insert spam lead: ${error.message}`);
  }
}

/**
 * Inserts an invalid lead into rejected_leads
 * Replicates "Insert Invalid Lead" node
 */
export async function insertInvalidLead(leadData, aiData) {
  try {
    logger.info('Inserting invalid lead', { email: leadData.email });

    const { data, error } = await supabase
      .from('rejected_leads')
      .insert({
        full_name: leadData.full_name,
        email: leadData.email,
        phone: leadData.phone,
        company_name: leadData.company_name,
        submitted_description: leadData.needs_description,
        source: 'website_form',
        classification: aiData.classification,
        ai_reasoning: aiData.ai_reasoning,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info('Invalid lead inserted', { leadId: data.id });

    return data;
  } catch (error) {
    logger.error('Error inserting invalid lead', error);
    throw new Error(`Failed to insert invalid lead: ${error.message}`);
  }
}

/**
 * Inserts a candidate lead into candidate_leads
 * Replicates "Insert Candidate Lead" node
 */
export async function insertCandidateLead(leadData, aiData) {
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

    return data;
  } catch (error) {
    logger.error('Error inserting candidate lead', error);
    throw new Error(`Failed to insert candidate lead: ${error.message}`);
  }
}

/**
 * Upserts a contact record
 * Replicates "Upsert Contacts with Email" HTTP node
 * Uses on_conflict=company_id,email with merge-duplicates
 */
export async function upsertContact(contactData) {
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

    return data;
  } catch (error) {
    logger.error('Error upserting contact', error);
    throw new Error(`Failed to upsert contact: ${error.message}`);
  }
}

/**
 * Creates a job ad record in website_jobs
 * Replicates "Create Job Ad Record" node
 */
export async function createJobAdRecord(jobAdData, formData, aiData) {
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

    return data;
  } catch (error) {
    logger.error('Error creating job ad record', error);
    throw new Error(`Failed to create job ad record: ${error.message}`);
  }
}
