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
import {
  getJobs,
  getJobById,
  getCompanies,
  getCompanyById,
  getContacts,
  getSignals,
  getDashboardSummary,
} from '../services/supabaseService.js';

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

// ============================================================================
// DATA LISTING ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/jobs
 * List jobs with optional filters
 * Query params: source, ai_valid (true/false), from_date, to_date, limit, offset
 */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const { source, ai_valid, from_date, to_date, limit, offset } = req.query;

    const result = await getJobs({
      source: source as string | undefined,
      ai_valid: ai_valid !== undefined ? ai_valid === 'true' : undefined,
      from_date: from_date as string | undefined,
      to_date: to_date as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      total: result.count,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
  } catch (error) {
    logger.error('Failed to fetch jobs', error);

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

/**
 * GET /api/admin/jobs/:id
 * Get a single job with full details
 */
router.get('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const job = await getJobById(req.params.id);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: job,
    });
  } catch (error) {
    logger.error('Failed to fetch job', error);

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

/**
 * GET /api/admin/companies
 * List companies with job/signal/contact counts
 * Query params: status, source, limit, offset
 */
router.get('/companies', async (req: Request, res: Response) => {
  try {
    const { status, source, limit, offset } = req.query;

    const result = await getCompanies({
      status: status as string | undefined,
      source: source as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      total: result.count,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
  } catch (error) {
    logger.error('Failed to fetch companies', error);

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

/**
 * GET /api/admin/companies/:id
 * Get a single company with all related jobs, signals, contacts
 */
router.get('/companies/:id', async (req: Request, res: Response) => {
  try {
    const company = await getCompanyById(req.params.id);

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: company,
    });
  } catch (error) {
    logger.error('Failed to fetch company', error);

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

/**
 * GET /api/admin/contacts
 * List contacts with company name
 * Query params: source, source_method, limit, offset
 */
router.get('/contacts', async (req: Request, res: Response) => {
  try {
    const { source, source_method, limit, offset } = req.query;

    const result = await getContacts({
      source: source as string | undefined,
      source_method: source_method as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      total: result.count,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
  } catch (error) {
    logger.error('Failed to fetch contacts', error);

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

/**
 * GET /api/admin/signals
 * List signals with company name
 * Query params: source, signal_type, limit, offset
 */
router.get('/signals', async (req: Request, res: Response) => {
  try {
    const { source, signal_type, limit, offset } = req.query;

    const result = await getSignals({
      source: source as string | undefined,
      signal_type: signal_type as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      total: result.count,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
  } catch (error) {
    logger.error('Failed to fetch signals', error);

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

/**
 * GET /api/admin/dashboard
 * Dashboard summary with key numbers
 */
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const summary = await getDashboardSummary();

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error('Failed to fetch dashboard summary', error);

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

export default router;
