import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger, getErrorMessage } from '../utils/logger.js';
import { verifyApiKey } from '../middleware/scraperAuth.js';
import { extractTextFromPdf, CvParsingError } from '../services/cvParsingService.js';
import { parseCv } from '../services/aiService.js';

const router: Router = Router();

// Request body validation
const CvParseRequestSchema = z.object({
  fileUrl: z.string().url('fileUrl must be a valid URL'),
});

/**
 * @swagger
 * /api/cv/parse:
 *   post:
 *     tags: [CV Parsing]
 *     summary: Parse a CV/resume PDF and extract structured data
 *     description: |
 *       Downloads a PDF from the provided URL, extracts text content, and uses AI to
 *       parse it into structured candidate data (profile, education, experience, skills,
 *       languages, references, certifications).
 *
 *       **Flow:** Download PDF → extract text with pdf-parse → AI structured extraction → validated JSON
 *
 *       **Supported formats:** Text-based PDFs only. Scanned/image PDFs will return a `scanned_pdf` error.
 *
 *       **Models:** Gemini 2.0 Flash (primary), GPT-4o-mini (fallback on failure).
 *
 *       **Cost:** ~$0.001 per parse.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fileUrl
 *             properties:
 *               fileUrl:
 *                 type: string
 *                 format: uri
 *                 description: Public URL of the PDF file (e.g. Supabase Storage URL)
 *                 example: "https://your-project.supabase.co/storage/v1/object/public/resumes/abc123.pdf"
 *     responses:
 *       200:
 *         description: CV parsed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     profile:
 *                       type: object
 *                       properties:
 *                         headline: { type: string, nullable: true }
 *                         bio: { type: string, nullable: true }
 *                         city: { type: string, nullable: true }
 *                         phone: { type: string, nullable: true }
 *                         linkedin_url: { type: string, nullable: true }
 *                         portfolio_url: { type: string, nullable: true }
 *                         years_of_experience: { type: number, nullable: true }
 *                     education:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           school: { type: string }
 *                           degree: { type: string, nullable: true }
 *                           field_of_study: { type: string, nullable: true }
 *                           start_date: { type: string, nullable: true }
 *                           end_date: { type: string, nullable: true }
 *                           is_current: { type: boolean }
 *                     experience:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           company_name: { type: string }
 *                           title: { type: string }
 *                           description: { type: string, nullable: true }
 *                           start_date: { type: string, nullable: true }
 *                           end_date: { type: string, nullable: true }
 *                           is_current: { type: boolean }
 *                     skills:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           skill_name: { type: string }
 *                           level: { type: string, nullable: true, enum: [beginner, intermediate, advanced] }
 *                           years: { type: number, nullable: true }
 *                     languages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           language: { type: string }
 *                           proficiency: { type: string, nullable: true, enum: [native, fluent, advanced, intermediate, beginner] }
 *                     references:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name: { type: string }
 *                           email: { type: string, nullable: true }
 *                           phone: { type: string, nullable: true }
 *                           company: { type: string, nullable: true }
 *                           relationship: { type: string, nullable: true }
 *                     certifications:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name: { type: string }
 *                           issuer: { type: string, nullable: true }
 *                           issue_date: { type: string, nullable: true }
 *                           expiry_date: { type: string, nullable: true }
 *                           credential_url: { type: string, nullable: true }
 *                     additional_notes:
 *                       type: string
 *                       nullable: true
 *                       description: Catch-all for CV information that doesn't fit other sections (hobbies, volunteer work, publications, awards, etc.)
 *                 processingTime:
 *                   type: number
 *                   description: Processing time in milliseconds
 *       400:
 *         description: Invalid request (missing fileUrl or invalid URL)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 error: { type: string }
 *       401:
 *         description: Missing or invalid API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       422:
 *         description: PDF could not be parsed (scanned PDF, empty text, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 error: { type: string }
 *                 code: { type: string, enum: [scanned_pdf, extraction_failed, ai_failed] }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/parse', verifyApiKey, async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // Validate request body
    const parseResult = CvParseRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: parseResult.error.errors.map((e) => e.message).join(', '),
      });
    }

    const { fileUrl } = parseResult.data;

    // Step 1: Download PDF and extract text
    const cvText = await extractTextFromPdf(fileUrl);

    // Step 2: Parse with AI
    const parsedData = await parseCv(cvText);

    const processingTime = Date.now() - startTime;

    logger.info('CV parse request complete', { processingTime, fileUrl });

    return res.status(200).json({
      success: true,
      data: parsedData,
      processingTime,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;

    if (error instanceof CvParsingError) {
      logger.warn('CV parsing failed with known error', {
        code: error.code,
        message: error.message,
        processingTime,
      });

      return res.status(422).json({
        success: false,
        error: error.message,
        code: error.code,
        processingTime,
      });
    }

    logger.error('CV parse request failed', error, { processingTime });

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
      processingTime,
    });
  }
});

export default router;
