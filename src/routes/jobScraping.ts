import { Router, Request, Response } from 'express';
import { config } from '../config/env.js';
import { logger, getErrorMessage } from '../utils/logger.js';
import { runIndeedFetch } from '../services/jobs/indeedJobScraper.js';
import { runLinkedInFetch } from '../services/jobs/linkedinJobScraper.js';
import { runAFFetch } from '../services/jobs/afJobScraper.js';
import { runJobProcessingPipeline } from '../services/jobs/jobProcessor.js';
import { deleteOldJobsBySource } from '../services/supabaseService.js';
import { sendJobScraperDigestEmail, sendScraperFailureAlert } from '../services/emailService.js';
import { ScraperRunRequestSchema, type ScraperRunRequestType } from '../schemas/scraper.js';
import { verifyScraperApiKey } from '../middleware/scraperAuth.js';

const router: Router = Router();

/**
 * @swagger
 * /api/scraping/jobs/health:
 *   get:
 *     tags: [Health]
 *     summary: Job scraper service health
 *     description: Health check for the job scraper service. Also reports whether scrapers are enabled.
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
 * /api/scraping/jobs/indeed:
 *   post:
 *     tags: [Scrapers]
 *     summary: Run Indeed job scraper
 *     description: |
 *       Triggers an Indeed scraper run via Apify. Fetches jobs, deduplicates against existing DB records,
 *       runs AI evaluation on each job, stores results, and sends a digest email. Typically triggered by cron.
 *
 *       **Tip:** Add `?dryRun=true` to get a mock response instantly without running the actual scraper.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: dryRun
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, returns mock data without running the scraper (for Swagger testing)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ScraperRunRequest'
 *     responses:
 *       200:
 *         description: Scraper run completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ScraperRunResult'
 *       401:
 *         description: Missing or invalid API key
 *       503:
 *         description: Scraper is disabled
 */
router.post('/indeed', async (req: Request, res: Response) => {
  const startTime = Date.now();

  // Dry run: return mock data instantly (for Swagger testing)
  if (req.query.dryRun === 'true') {
    return res.status(200).json({
      success: true,
      dryRun: true,
      runId: '00000000-0000-0000-0000-000000000000',
      processingTime: 0,
      stats: { fetched: 25, afterDedup: 18, afterFilter: 15, processed: 15, valid: 12, discarded: 3, errors: 0 },
      summary: { newJobsFound: 18, validJobs: 12, discardedJobs: 3, errors: 0 },
    });
  }

  try {
    if (!config.scraper.enabled) {
      return res.status(503).json({
        success: false,
        error: 'Scraper is disabled',
      });
    }

    // Parse and validate request body
    const parseResult = ScraperRunRequestSchema.safeParse(req.body);
    const runConfig: ScraperRunRequestType = parseResult.success
      ? parseResult.data
      : { country: 'SE', maxItems: 50 };

    logger.info('Starting Indeed scraper run', { config: runConfig });

    // 1. Fetch jobs from Indeed via Apify
    const { jobs } = await runIndeedFetch({
      keywords: runConfig.keywords,
      exclusionKeywords: runConfig.exclusionKeywords,
      country: runConfig.country,
      maxItems: runConfig.maxItems,
    });

    // 2. Process jobs through the pipeline
    const result = await runJobProcessingPipeline(jobs, 'indeed');

    // 3. Send email digest (don't wait, don't fail if it errors)
    sendJobScraperDigestEmail(result).catch((err) => {
      logger.error('Failed to send scraper digest email', err);
    });

    const processingTime = Date.now() - startTime;

    logger.info('Indeed scraper run complete', {
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
        newJobsFound: result.stats.afterDedup,
        validJobs: result.stats.valid,
        discardedJobs: result.stats.discarded,
        errors: result.stats.errors,
      },
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Indeed scraper run failed', error, { processingTime });

    sendScraperFailureAlert('indeed', error, { processingTime }).catch(() => {});

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
      processingTime,
    });
  }
});

/**
 * @swagger
 * /api/scraping/jobs/linkedin:
 *   post:
 *     tags: [Scrapers]
 *     summary: Run LinkedIn job scraper
 *     description: |
 *       Triggers a LinkedIn scraper run via Apify. Same pipeline as Indeed. Default maxItems is 10.
 *
 *       **Tip:** Add `?dryRun=true` to get a mock response instantly without running the actual scraper.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: dryRun
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, returns mock data without running the scraper (for Swagger testing)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ScraperRunRequest'
 *     responses:
 *       200:
 *         description: Scraper run completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ScraperRunResult'
 *       401:
 *         description: Missing or invalid API key
 *       503:
 *         description: Scraper is disabled
 */
router.post('/linkedin', async (req: Request, res: Response) => {
  const startTime = Date.now();

  // Dry run: return mock data instantly (for Swagger testing)
  if (req.query.dryRun === 'true') {
    return res.status(200).json({
      success: true,
      dryRun: true,
      runId: '00000000-0000-0000-0000-000000000000',
      processingTime: 0,
      stats: { fetched: 10, afterDedup: 8, afterFilter: 7, processed: 7, valid: 5, discarded: 2, errors: 0 },
      summary: { newJobsFound: 8, validJobs: 5, discardedJobs: 2, errors: 0 },
    });
  }

  try {
    if (!config.scraper.enabled) {
      return res.status(503).json({
        success: false,
        error: 'Scraper is disabled',
      });
    }

    // Parse and validate request body
    const parseResult = ScraperRunRequestSchema.safeParse(req.body);
    const runConfig: ScraperRunRequestType = parseResult.success
      ? parseResult.data
      : { country: 'SE', maxItems: 10 };

    logger.info('Starting LinkedIn scraper run', { config: runConfig });

    // 1. Fetch jobs from LinkedIn via Apify (all categories)
    const { jobs } = await runLinkedInFetch({
      keywords: runConfig.keywords,
      exclusionKeywords: runConfig.exclusionKeywords,
      country: runConfig.country,
      maxItems: runConfig.maxItems,
    });

    // 2. Process jobs through the pipeline
    const result = await runJobProcessingPipeline(jobs, 'linkedin');

    // 3. Send email digest (don't wait, don't fail if it errors)
    sendJobScraperDigestEmail(result).catch((err) => {
      logger.error('Failed to send scraper digest email', err);
    });

    const processingTime = Date.now() - startTime;

    logger.info('LinkedIn scraper run complete', {
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
        newJobsFound: result.stats.afterDedup,
        validJobs: result.stats.valid,
        discardedJobs: result.stats.discarded,
        errors: result.stats.errors,
      },
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('LinkedIn scraper run failed', error, { processingTime });

    sendScraperFailureAlert('linkedin', error, { processingTime }).catch(() => {});

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
      processingTime,
    });
  }
});

/**
 * @swagger
 * /api/scraping/jobs/af:
 *   post:
 *     tags: [Scrapers]
 *     summary: Run Arbetsförmedlingen job scraper
 *     description: |
 *       Triggers an Arbetsförmedlingen scraper run via the free JobTech API (no Apify needed).
 *       Includes API email fallback and pagination. Default maxItems is 100.
 *
 *       **Tip:** Add `?dryRun=true` to get a mock response instantly without running the actual scraper.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: dryRun
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, returns mock data without running the scraper (for Swagger testing)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ScraperRunRequest'
 *     responses:
 *       200:
 *         description: Scraper run completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ScraperRunResult'
 *       401:
 *         description: Missing or invalid API key
 *       503:
 *         description: Scraper is disabled
 */
router.post('/af', async (req: Request, res: Response) => {
  const startTime = Date.now();

  // Dry run: return mock data instantly (for Swagger testing)
  if (req.query.dryRun === 'true') {
    return res.status(200).json({
      success: true,
      dryRun: true,
      runId: '00000000-0000-0000-0000-000000000000',
      processingTime: 0,
      stats: { fetched: 50, afterDedup: 40, afterFilter: 35, processed: 35, valid: 28, discarded: 7, errors: 0 },
      summary: { newJobsFound: 40, validJobs: 28, discardedJobs: 7, errors: 0 },
    });
  }

  try {
    if (!config.scraper.enabled) {
      return res.status(503).json({
        success: false,
        error: 'Scraper is disabled',
      });
    }

    // Parse and validate request body
    const parseResult = ScraperRunRequestSchema.safeParse(req.body);
    const runConfig: ScraperRunRequestType = parseResult.success
      ? parseResult.data
      : { country: 'SE', maxItems: 100 };

    logger.info('Starting AF scraper run', { config: runConfig });

    // 1. Fetch jobs from Arbetsformedlingen via JobTech API
    const { jobs } = await runAFFetch({
      keywords: runConfig.keywords,
      exclusionKeywords: runConfig.exclusionKeywords,
      maxItems: runConfig.maxItems,
    });

    // 2. Process jobs through the pipeline
    const result = await runJobProcessingPipeline(jobs, 'arbetsformedlingen');

    // 3. Send email digest (don't wait, don't fail if it errors)
    sendJobScraperDigestEmail(result).catch((err) => {
      logger.error('Failed to send scraper digest email', err);
    });

    const processingTime = Date.now() - startTime;

    logger.info('AF scraper run complete', {
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
        newJobsFound: result.stats.afterDedup,
        validJobs: result.stats.valid,
        discardedJobs: result.stats.discarded,
        errors: result.stats.errors,
      },
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('AF scraper run failed', error, { processingTime });

    sendScraperFailureAlert('arbetsformedlingen', error, { processingTime }).catch(() => {});

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
      processingTime,
    });
  }
});

/**
 * @swagger
 * /api/scraping/jobs/cleanup:
 *   post:
 *     tags: [Scrapers]
 *     summary: Clean up old jobs
 *     description: |
 *       Deletes jobs older than the retention period (default 20 days) for each scraper source.
 *
 *       **Tip:** Add `?dryRun=true` to get a mock response instantly without deleting anything.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: dryRun
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, returns mock data without deleting anything (for Swagger testing)
 *     responses:
 *       200:
 *         description: Cleanup completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 retentionDays: { type: integer, example: 20 }
 *                 deletedBySource:
 *                   type: object
 *                   additionalProperties: { type: integer }
 *                   example: { indeed: 10, linkedin: 5, arbetsformedlingen: 8 }
 *                 totalDeleted: { type: integer, example: 23 }
 *       401:
 *         description: Missing or invalid API key
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  // Dry run: return mock data instantly (for Swagger testing)
  if (req.query.dryRun === 'true') {
    return res.status(200).json({
      success: true,
      dryRun: true,
      retentionDays: config.scraper.retentionDays,
      deletedBySource: { indeed: 10, linkedin: 5, arbetsformedlingen: 8 },
      totalDeleted: 23,
    });
  }

  try {
    const sources = ['indeed', 'linkedin', 'arbetsformedlingen'] as const;
    const retentionDays = config.scraper.retentionDays;

    const results: Record<string, number> = {};
    let totalDeleted = 0;

    for (const source of sources) {
      try {
        const deleted = await deleteOldJobsBySource(source, retentionDays);
        results[source] = deleted;
        totalDeleted += deleted;
      } catch (err) {
        logger.error(`Failed to cleanup ${source} jobs`, err);
        results[source] = 0;
      }
    }

    logger.info('Job cleanup complete', { results, totalDeleted, retentionDays });

    return res.status(200).json({
      success: true,
      retentionDays,
      deletedBySource: results,
      totalDeleted,
    });
  } catch (error) {
    logger.error('Job cleanup failed', error);

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

export default router;
