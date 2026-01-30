import express from 'express';
import { logger } from '../utils/logger.js';
import {
  validateLead,
  extractDomain,
  normalizeCompanyData,
  prepareContactData,
} from '../utils/validator.js';
import { scoreLead, generateJobAd } from '../services/aiService.js';
import {
  findOrCreateCompany,
  createSignal,
  insertSpamLead,
  insertInvalidLead,
  insertCandidateLead,
  upsertContact,
  createJobAdRecord,
} from '../services/supabaseService.js';
import { sendEmailToLead } from '../services/emailService.js';

const router = express.Router();

/**
 * Main webhook handler
 * Replicates the entire N8n flow
 */
router.post('/webhook', async (req, res) => {
  const startTime = Date.now();
  
  try {
    logger.info('Webhook received', { body: req.body });

    // Step 1: Edit Fields - Extract and structure the form data
    const formData = {
      id: Date.now().toString(),
      full_name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      company_name: req.body.company,
      industry: req.body.industry,
      service_type: req.body.service_type,
      needs_description: req.body.message,
      subject: req.body.subject,
    };

    logger.info('Form data structured', { email: formData.email });

    // Step 2: Lead Data Validation - Validate and check for spam
    const validatedData = validateLead(formData);

    // Step 3: If - Check if validation passes
    const passesValidation = validatedData.validation_score > 30 && !validatedData.is_likely_spam;

    if (!passesValidation) {
      // Fast reject path - Insert as spam and return
      logger.warn('Lead failed validation - fast reject', {
        score: validatedData.validation_score,
        isSpam: validatedData.is_likely_spam,
      });

      await insertSpamLead(validatedData);

      return res.status(200).json({
        success: true,
        message: 'Lead received but classified as spam (fast reject)',
        classification: 'spam',
        processingTime: Date.now() - startTime,
      });
    }

    // Step 4: Scoring AI Agent - Get AI classification
    const aiScore = await scoreLead(validatedData);

    // Step 5: Extract Domain
    const dataWithDomain = extractDomain({ ...validatedData, ...aiScore });

    // Step 6: Find or Create Company
    const companyId = await findOrCreateCompany(
      dataWithDomain.company_name,
      dataWithDomain.extracted_domain
    );

    // Step 7: Parse Company ID (already done in the function above)
    const dataWithCompanyId = { ...dataWithDomain, company_id: companyId };

    // Step 8: Create Signal
    const signal = await createSignal(companyId, {
      full_name: dataWithCompanyId.full_name,
      email: dataWithCompanyId.email,
      phone: dataWithCompanyId.phone,
      needs_description: dataWithCompanyId.needs_description,
      lead_score: dataWithCompanyId.lead_score,
      classification: dataWithCompanyId.classification,
    });

    // Step 9: Normalize Company Data
    const normalizedData = normalizeCompanyData(formData, aiScore, { company_id: companyId });

    // Step 10: Switch - Route based on classification
    const classification = normalizedData.classification;

    logger.info('Classification determined', { classification });

    switch (classification) {
      case 'valid_lead':
        // Valid lead path - Continue to contact creation and job ad generation
        logger.info('Processing valid lead');

        // Step 11: Prepare Contact Data
        const contactData = prepareContactData(formData, normalizedData);

        // Step 12: Upsert Contact
        await upsertContact(contactData);

        // Step 13: Generate Job Ad Draft
        const jobAd = await generateJobAd(formData, normalizedData);
        
        // Add company_id to job ad data
        const jobAdWithCompanyId = { ...jobAd, company_id: companyId };

        // Step 14: Create Job Ad Record
        await createJobAdRecord(jobAdWithCompanyId, formData, aiScore);

        // Step 15: Send Email to Lead
        await sendEmailToLead(formData.email, jobAd);

        return res.status(200).json({
          success: true,
          message: 'Valid lead processed successfully',
          classification: 'valid_lead',
          lead_score: normalizedData.lead_score,
          job_ad_title: jobAd.title,
          processingTime: Date.now() - startTime,
        });

      case 'invalid_lead':
        // Invalid lead path
        logger.info('Processing invalid lead');
        await insertInvalidLead(formData, aiScore);

        return res.status(200).json({
          success: true,
          message: 'Lead classified as invalid',
          classification: 'invalid_lead',
          reason: aiScore.ai_reasoning,
          processingTime: Date.now() - startTime,
        });

      case 'likely_candidate':
        // Candidate path
        logger.info('Processing likely candidate');
        await insertCandidateLead(formData, aiScore, companyId);

        return res.status(200).json({
          success: true,
          message: 'Lead classified as job seeker',
          classification: 'likely_candidate',
          processingTime: Date.now() - startTime,
        });

      case 'likely_spam':
        // Spam path (from AI classification)
        logger.info('Processing likely spam (AI classified)');
        await insertSpamLead(formData, aiScore.ai_reasoning);

        return res.status(200).json({
          success: true,
          message: 'Lead classified as spam',
          classification: 'likely_spam',
          processingTime: Date.now() - startTime,
        });

      default:
        logger.error('Unknown classification', { classification });
        throw new Error(`Unknown classification: ${classification}`);
    }
  } catch (error) {
    logger.error('Webhook processing failed', error, {
      body: req.body,
      processingTime: Date.now() - startTime,
    });

    // Return 500 for actual errors
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      processingTime: Date.now() - startTime,
    });
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;
