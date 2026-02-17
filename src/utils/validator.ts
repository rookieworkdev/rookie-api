import { logger } from './logger.js';
import type {
  FormData,
  ValidatedLead,
  ValidationDetails,
  AIScoreResult,
  NormalizedCompanyData,
  ContactData,
} from '../types/index.js';

interface DataWithDomainInput {
  email?: string;
  company_name?: string;
  [key: string]: unknown;
}

interface DataWithDomainResult {
  extracted_domain: string | null;
  domain_source: 'email' | 'guessed' | 'none';
}

interface SignalData {
  company_id: string;
}

interface SwitchData {
  company_id: string;
}

/**
 * Validates lead data and performs spam detection
 * Originally the "Lead Data Validation" node in n8n, now maintained here
 */
export function validateLead(lead: FormData): ValidatedLead {
  const validation: ValidationDetails = {
    email_valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email || ''),
    phone_valid: /[\d\s\-+()]{8,}/.test(lead.phone || ''),
    company_filled: (lead.company_name || '').length > 2,
    needs_description_length: (lead.needs_description || '').length,
    needs_adequate: (lead.needs_description || '').length >= 50,
    contact_name_filled: (lead.full_name || '').length > 2,
  };

  // Calculate basic validation score (0-100)
  const booleanFields: (keyof ValidationDetails)[] = [
    'email_valid',
    'phone_valid',
    'company_filled',
    'needs_adequate',
    'contact_name_filled',
  ];
  const validFields = booleanFields.filter((key) => validation[key] === true).length;
  // Add 1 for needs_description_length check (considered valid if > 0)
  const totalFields = 6;
  const validationScore = Math.round(((validFields + (validation.needs_description_length > 0 ? 1 : 0)) / totalFields) * 100);

  // Check for spam indicators
  const spamIndicators = [
    /(viagra|cialis|casino|crypto|bitcoin)/i.test(lead.needs_description || ''),
    /(click here|buy now|limited offer)/i.test(lead.needs_description || ''),
    (lead.needs_description || '').includes('http'),
    Boolean((lead.email || '').match(/@(test|example|temp|fake)/i)),
  ];

  const isLikelySpam = spamIndicators.filter((v) => v).length >= 2;

  logger.debug('Lead validation complete', {
    validationScore,
    isLikelySpam,
    validFields,
  });

  return {
    ...lead,
    validation_score: validationScore,
    is_likely_spam: isLikelySpam,
    validation_details: validation,
  };
}

/**
 * Extracts domain from email or company name
 * Originally the "Extract Domain" node in n8n, now maintained here
 */
export function extractDomain<T extends DataWithDomainInput>(data: T): T & DataWithDomainResult {
  let domain: string | null = null;
  let domainSource: 'email' | 'guessed' | 'none' = 'none';

  // Try to extract from email domain first
  if (data.email && data.email.includes('@')) {
    const emailDomain = data.email.split('@')[1].toLowerCase();

    // Only use if NOT a personal email domain
    const personalDomains = [
      'gmail.com',
      'hotmail.com',
      'outlook.com',
      'icloud.com',
      'yahoo.com',
      'live.com',
      'hotmail.se',
      'outlook.se',
    ];

    if (!personalDomains.includes(emailDomain)) {
      domain = emailDomain;
      domainSource = 'email';
    }
  }

  // Fallback: try to guess from company name
  if (!domain && data.company_name) {
    // Simple guess: company name + .se (Swedish default)
    const cleanName = data.company_name
      .toLowerCase()
      .replace(/\s+ab$/i, '')
      .replace(/\s+aktiebolag$/i, '')
      .replace(/\s+/g, '');

    domain = `${cleanName}.se`; // Fallback guess
    domainSource = 'guessed';
  }

  logger.debug('Domain extracted', { domain, domainSource });

  return {
    ...data,
    extracted_domain: domain,
    domain_source: domainSource,
  };
}

/**
 * Normalizes company data across the flow
 * Originally the "Normalize Company Data" node in n8n, now maintained here
 */
export function normalizeCompanyData(
  formData: FormData,
  aiData: AIScoreResult,
  signalData: SignalData
): NormalizedCompanyData {
  return {
    company_id: signalData.company_id,
    full_name: formData.full_name,
    email: formData.email,
    phone: formData.phone,
    company_name: formData.company_name,
    industry: formData.industry,
    needs_description: formData.needs_description,
    lead_score: aiData.lead_score,
    role_category: aiData.role_category,
    key_requirements: aiData.key_requirements,
    ai_reasoning: aiData.ai_reasoning,
    classification: aiData.classification,
  };
}

/**
 * Prepares contact data for upsert
 * Originally the "Prepare Contact Data" node in n8n, now maintained here
 */
export function prepareContactData(formData: FormData, switchData: SwitchData): ContactData {
  if (!formData.email) {
    throw new Error('No email provided for contact');
  }

  return {
    company_id: switchData.company_id,
    full_name: formData.full_name,
    email: formData.email.toLowerCase().trim(),
    phone: formData.phone,
    source: 'website_form',
  };
}
