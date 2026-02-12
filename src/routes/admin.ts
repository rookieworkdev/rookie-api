import { Router, Request, Response } from 'express';
import { logger, getErrorMessage } from '../utils/logger.js';
import {
  runFullHealthCheck,
  getSignalsBySource,
  getTopCompanies,
  getJobsBySource,
} from '../services/healthCheckService.js';
import { sendHealthCheckDigestEmail } from '../services/emailService.js';
import { verifyScraperApiKey } from '../middleware/scraperAuth.js';

const router: Router = Router();

/**
 * GET /api/admin/health
 * Simple health check (public - no auth required)
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    service: 'admin',
    timestamp: new Date().toISOString(),
  });
});

// Apply API key verification to all routes below
router.use(verifyScraperApiKey);

/**
 * GET /api/admin/health-check
 * Run all health checks and return full JSON result
 */
router.get('/health-check', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const result = await runFullHealthCheck();

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Health check failed', error, { processingTime });

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
      processingTime,
    });
  }
});

/**
 * GET /api/admin/stats/signals-by-source
 * Get signal counts grouped by source
 */
router.get('/stats/signals-by-source', async (_req: Request, res: Response) => {
  try {
    const data = await getSignalsBySource();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('Failed to get signals by source', error);

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

/**
 * GET /api/admin/stats/top-companies
 * Get top 20 companies by signal count
 */
router.get('/stats/top-companies', async (_req: Request, res: Response) => {
  try {
    const data = await getTopCompanies();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('Failed to get top companies', error);

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

/**
 * GET /api/admin/stats/jobs-by-source
 * Get job counts grouped by source
 */
router.get('/stats/jobs-by-source', async (_req: Request, res: Response) => {
  try {
    const data = await getJobsBySource();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('Failed to get jobs by source', error);

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

/**
 * POST /api/admin/health-check/send-digest
 * Run health check and send digest email
 */
router.post('/health-check/send-digest', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const result = await runFullHealthCheck();
    const emailResult = await sendHealthCheckDigestEmail(result);

    const processingTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      emailSent: !!emailResult,
      emailId: emailResult?.id || null,
      processingTime,
      summary: result.summary,
      overallSeverity: result.overallSeverity,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Health check digest send failed', error, { processingTime });

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
      processingTime,
    });
  }
});

export default router;
