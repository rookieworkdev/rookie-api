import { Router, Request, Response } from 'express';
import { config } from '../config/env.js';
import { logger, getErrorMessage } from '../utils/logger.js';
import { runGoogleMapsFetch } from '../services/leads/googleMapsScraper.js';
import { sendLeadScraperDigestEmail, sendScraperFailureAlert } from '../services/emailService.js';
import { LeadScraperRunRequestSchema, type LeadScraperRunRequestType } from '../schemas/scraper.js';
import { verifyScraperApiKey } from '../middleware/scraperAuth.js';

const router: Router = Router();

/**
 * @swagger
 * /api/scraping/leads/health:
 *   get:
 *     tags: [Health]
 *     summary: Lead scraper service health
 *     description: Health check for the lead scraper service. Also reports whether scrapers are enabled.
 *     responses:
 *       200:
 *         description: Service status
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    enabled: config.scraper.enabled,
    timestamp: new Date().toISOString(),
  });
});

// Apply API key verification to protected routes below
router.use(verifyScraperApiKey);

/**
 * @swagger
 * /api/scraping/leads/google-maps:
 *   post:
 *     tags: [Scrapers]
 *     summary: Run Google Maps lead scraper
 *     description: |
 *       Triggers a Google Maps lead scraper run via Apify. Finds companies on Google Maps,
 *       runs AI evaluation on each, creates company + signal + contacts. Sends digest email.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               searchQueries:
 *                 type: array
 *                 items: { type: string }
 *                 example: ['tech companies Stockholm', 'IT companies Gothenburg']
 *               maxItemsPerQuery: { type: integer, default: 50 }
 *               countryFilter: { type: string, default: SE }
 *     responses:
 *       200:
 *         description: Scraper run completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 runId: { type: string }
 *                 processingTime: { type: number }
 *                 stats:
 *                   type: object
 *                   properties:
 *                     fetched: { type: integer }
 *                     afterFilter: { type: integer }
 *                     processed: { type: integer }
 *                     valid: { type: integer }
 *                     discarded: { type: integer }
 *                     contactsCreated: { type: integer }
 *                     errors: { type: integer }
 *       401:
 *         description: Missing or invalid API key
 *       503:
 *         description: Scraper is disabled
 */
router.post('/google-maps', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    if (!config.scraper.enabled) {
      return res.status(503).json({
        success: false,
        error: 'Scraper is disabled',
      });
    }

    // Parse and validate request body
    const parseResult = LeadScraperRunRequestSchema.safeParse(req.body);
    const runConfig: LeadScraperRunRequestType = parseResult.success
      ? parseResult.data
      : { maxItemsPerQuery: 50, countryFilter: 'SE' };

    logger.info('Starting Google Maps lead scraper run', { config: runConfig });

    // 1. Run the full Google Maps pipeline
    const result = await runGoogleMapsFetch({
      searchQueries: runConfig.searchQueries,
      maxItemsPerQuery: runConfig.maxItemsPerQuery,
    });

    // 2. Send digest email (fire-and-forget)
    sendLeadScraperDigestEmail(result).catch((err) => {
      logger.error('Failed to send lead scraper digest email', err);
    });

    const processingTime = Date.now() - startTime;

    logger.info('Google Maps lead scraper run complete', {
      runId: result.runId,
      processingTime,
      stats: result.stats,
    });

    return res.status(200).json({
      success: true,
      runId: result.runId,
      processingTime,
      stats: result.stats,
      summary: {
        companiesEvaluated: result.stats.processed,
        validProspects: result.stats.valid,
        contactsCreated: result.stats.contactsCreated,
        discarded: result.stats.discarded,
        errors: result.stats.errors,
      },
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Google Maps lead scraper run failed', error, { processingTime });

    sendScraperFailureAlert('google_maps', error, { processingTime }).catch(() => {});

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
      processingTime,
    });
  }
});

export default router;
