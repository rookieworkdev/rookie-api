import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { logger, getErrorMessage } from '../utils/logger.js';
import { runIndeedFetch } from '../services/jobs/indeedJobScraper.js';
import { runLinkedInFetch } from '../services/jobs/linkedinJobScraper.js';
import { runAFFetch } from '../services/jobs/afJobScraper.js';
import { runJobProcessingPipeline } from '../services/jobs/jobProcessor.js';
import { deleteOldJobsBySource } from '../services/supabaseService.js';
import { sendJobScraperDigestEmail } from '../services/emailService.js';
import { ScraperRunRequestSchema, type ScraperRunRequestType } from '../schemas/scraper.js';

const router: Router = Router();

/**
 * Middleware to verify scraper API key
 */
function verifyScraperApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];

  if (!config.scraper.apiKey) {
    if (config.nodeEnv === 'production') {
      logger.error('Scraper API key not configured in production');
      res.status(500).json({ success: false, error: 'Scraper API key not configured' });
      return;
    }
    logger.warn('Scraper API key not configured, allowing request in non-production');
    next();
    return;
  }

  if (!apiKey || typeof apiKey !== 'string') {
    logger.warn('Missing scraper API key');
    res.status(401).json({ success: false, error: 'Invalid or missing API key' });
    return;
  }

  const expected = Buffer.from(config.scraper.apiKey);
  const provided = Buffer.from(apiKey);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    logger.warn('Invalid scraper API key');
    res.status(401).json({ success: false, error: 'Invalid or missing API key' });
    return;
  }

  next();
}

/**
 * GET /api/scraping/jobs/health
 * Health check for scraper endpoints (public - no auth required)
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
 * POST /api/scraping/jobs/indeed
 * Run the Indeed job scraper
 */
router.post('/indeed', async (req: Request, res: Response) => {
  const startTime = Date.now();

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

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
      processingTime,
    });
  }
});

/**
 * POST /api/scraping/jobs/linkedin
 * Run the LinkedIn job scraper
 */
router.post('/linkedin', async (req: Request, res: Response) => {
  const startTime = Date.now();

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

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
      processingTime,
    });
  }
});

/**
 * POST /api/scraping/jobs/af
 * Run the Arbetsformedlingen job scraper
 */
router.post('/af', async (req: Request, res: Response) => {
  const startTime = Date.now();

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

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
      processingTime,
    });
  }
});

/**
 * POST /api/scraping/jobs/cleanup
 * Clean up old jobs from the database
 */
router.post('/cleanup', async (_req: Request, res: Response) => {
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
