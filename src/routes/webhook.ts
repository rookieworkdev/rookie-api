import express, { Request, Response, Router } from 'express';
import { logger, getErrorMessage, maskEmail } from '../utils/logger.js';
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
  insertRejectedLead,
  insertCandidateLead,
  upsertContact,
  createJobAdRecord,
} from '../services/supabaseService.js';
import { sendEmailToLead, sendAdminAlert } from '../services/emailService.js';
import {
  parseWebhookRequest,
  formatValidationErrors,
} from '../schemas/webhook.js';
import { verifyWebhookSignature } from '../middleware/webhookAuth.js';
import type {
  FormData,
  WebhookSuccessResponse,
  JobAdWithCompanyId,
} from '../types/index.js';

const router: Router = express.Router();

/**
 * Main webhook handler
 * Replicates the entire N8n flow
 */
/**
 * Masks PII fields for GDPR-compliant logging while preserving structure visibility
 */
function maskPiiForLogging(body: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...body };

  if (typeof masked.name === 'string') {
    masked.name = masked.name.length > 0 ? `[REDACTED:${masked.name.length}chars]` : '[EMPTY]';
  }
  if (typeof masked.email === 'string') {
    masked.email = maskEmail(masked.email);
  }
  if (typeof masked.phone === 'string') {
    masked.phone = masked.phone.length > 0 ? `[REDACTED:${masked.phone.length}chars]` : '[EMPTY]';
  }

  return masked;
}

router.post('/webhook', verifyWebhookSignature, async (req: Request, res: Response) => {
  const startTime = Date.now();

  // Declare formData outside try block so it's accessible in catch
  let formData: FormData | undefined;

  try {
    logger.info('Webhook received', { body: maskPiiForLogging(req.body) });

    // Step 1: Validate request body with zod
    const validationResult = parseWebhookRequest(req.body);

    if (!validationResult.success) {
      const errorMessage = formatValidationErrors(validationResult.errors);
      logger.warn('Request validation failed', { errors: errorMessage });

      return res.status(400).json({
        success: false,
        message: 'Invalid request data',
        errors: errorMessage,
        processingTime: Date.now() - startTime,
      });
    }

    const validatedBody = validationResult.data;

    // Step 2: Structure the validated form data
    formData = {
      id: Date.now().toString(),
      full_name: validatedBody.name,
      email: validatedBody.email,
      phone: validatedBody.phone,
      company_name: validatedBody.company,
      industry: validatedBody.industry,
      service_type: validatedBody.service_type,
      needs_description: validatedBody.message,
      subject: validatedBody.subject,
    };

    logger.info('Form data structured', { email: maskEmail(formData.email) });

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

      await insertRejectedLead(validatedData);

      const response: WebhookSuccessResponse = {
        success: true,
        message: 'Lead received but classified as spam (fast reject)',
        classification: 'spam',
        processingTime: Date.now() - startTime,
      };

      return res.status(200).json(response);
    }

    // Step 4: Scoring AI Agent - Get AI classification
    const aiScore = await scoreLead(validatedData);

    // Step 5: Switch - Route based on classification
    const classification = aiScore.classification;

    logger.info('Classification determined', { classification });

    switch (classification) {
      case 'valid_lead': {
        // Valid lead path - Continue to contact creation and job ad generation
        logger.info('Processing valid lead');

        // Step 6: Extract Domain
        const dataWithDomain = extractDomain({ ...validatedData, ...aiScore });

        // Step 7: Find or Create Company
        const companyId = await findOrCreateCompany(
          dataWithDomain.company_name || '',
          dataWithDomain.extracted_domain
        );

        // Step 8: Create Signal
        await createSignal(companyId, {
          full_name: dataWithDomain.full_name,
          email: dataWithDomain.email,
          phone: dataWithDomain.phone,
          needs_description: dataWithDomain.needs_description,
          lead_score: dataWithDomain.lead_score,
          classification: dataWithDomain.classification,
        });

        // Step 9: Normalize Company Data
        const normalizedData = normalizeCompanyData(formData, aiScore, { company_id: companyId });

        // Step 10: Prepare Contact Data
        const contactData = prepareContactData(formData, normalizedData);

        // Step 11 & 12: Upsert Contact and Generate Job Ad in parallel (independent operations)
        const [, jobAd] = await Promise.all([
          upsertContact(contactData),
          generateJobAd(formData, normalizedData),
        ]);

        // Add company_id to job ad data
        const jobAdWithCompanyId: JobAdWithCompanyId = { ...jobAd, company_id: companyId };

        // Step 13: Create Job Ad Record
        await createJobAdRecord(jobAdWithCompanyId, formData, aiScore);

        // Step 14: Send Email to Lead
        await sendEmailToLead(formData.email || '', jobAd, formData.company_name || '');

        const response: WebhookSuccessResponse = {
          success: true,
          message: 'Valid lead processed successfully',
          classification: 'valid_lead',
          lead_score: normalizedData.lead_score,
          job_ad_title: jobAd.title,
          processingTime: Date.now() - startTime,
        };

        return res.status(200).json(response);
      }

      case 'invalid_lead': {
        // Invalid lead path
        logger.info('Processing invalid lead');
        await insertRejectedLead(formData, aiScore.classification, aiScore.ai_reasoning);

        const response: WebhookSuccessResponse = {
          success: true,
          message: 'Lead classified as invalid',
          classification: 'invalid_lead',
          reason: aiScore.ai_reasoning,
          processingTime: Date.now() - startTime,
        };

        return res.status(200).json(response);
      }

      case 'likely_candidate': {
        // Candidate path
        logger.info('Processing likely candidate');
        await insertCandidateLead(formData, aiScore);

        const response: WebhookSuccessResponse = {
          success: true,
          message: 'Lead classified as job seeker',
          classification: 'likely_candidate',
          processingTime: Date.now() - startTime,
        };

        return res.status(200).json(response);
      }

      case 'likely_spam': {
        // Spam path (from AI classification)
        logger.info('Processing likely spam (AI classified)');
        await insertRejectedLead(formData, 'likely_spam', aiScore.ai_reasoning);

        const response: WebhookSuccessResponse = {
          success: true,
          message: 'Lead classified as spam',
          classification: 'likely_spam',
          processingTime: Date.now() - startTime,
        };

        return res.status(200).json(response);
      }

      default: {
        logger.error('Unknown classification', { classification });
        throw new Error(`Unknown classification: ${classification}`);
      }
    }
  } catch (error) {
    logger.error('Webhook processing failed', error, {
      body: maskPiiForLogging(req.body),
      processingTime: Date.now() - startTime,
    });

    // Save form data to rejected_leads so it's not lost
    if (formData) {
      try {
        await insertRejectedLead(formData, 'processing_error', `Processing error: ${getErrorMessage(error)}`);
        logger.info('Form data saved to rejected_leads after processing failure');
      } catch (saveError) {
        logger.error('Failed to save form data after error', saveError);
        // Continue anyway - we'll still send the alert
      }

      // Send admin alert email with form data and error details
      try {
        await sendAdminAlert(formData, error, 'webhook_processing');
      } catch (alertError) {
        logger.error('Failed to send admin alert', alertError);
        // Continue anyway - data is already saved
      }
    }

    // Return 200 (not 500) - user doesn't need to know about internal errors
    // Their data has been saved and admin has been notified
    const response: WebhookSuccessResponse = {
      success: true,
      message: 'Submission received and will be processed',
      processingTime: Date.now() - startTime,
    };

    return res.status(200).json(response);
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;
