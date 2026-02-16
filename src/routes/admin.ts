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
  getAlerts,
} from '../services/supabaseService.js';

const router: Router = Router();

/**
 * @swagger
 * /api/admin/health:
 *   get:
 *     tags: [Health]
 *     summary: Admin service health check
 *     description: Simple health ping to check if the admin service is running. No authentication required.
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheck'
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
 * @swagger
 * /api/admin/health-check:
 *   get:
 *     tags: [Stats]
 *     summary: Full database health check
 *     description: |
 *       Runs 19 checks across 5 categories: referential integrity, data quality, freshness, signal stats, and volume.
 *       Each check returns a severity level (ok, warning, critical). This is the same data that powers the email digest.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Health check results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     ok: { type: integer }
 *                     warning: { type: integer }
 *                     critical: { type: integer }
 *                 overallSeverity:
 *                   type: string
 *                   enum: [ok, warning, critical]
 *                 checks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name: { type: string }
 *                       category: { type: string }
 *                       severity: { type: string, enum: [ok, warning, critical] }
 *                       count: { type: integer }
 *                       message: { type: string }
 *       401:
 *         description: Missing or invalid API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 * @swagger
 * /api/admin/stats/signals-by-source:
 *   get:
 *     tags: [Stats]
 *     summary: Signal counts grouped by source
 *     description: Returns how many signals (recruitment intent indicators) each source has produced, with 7-day and 30-day trends.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Signal counts by source
 *       401:
 *         description: Missing or invalid API key
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
 * @swagger
 * /api/admin/stats/top-companies:
 *   get:
 *     tags: [Stats]
 *     summary: Top 20 companies by signal count
 *     description: Returns the top 20 companies ranked by number of recruitment signals (job postings, form submissions, etc.).
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Top companies list
 *       401:
 *         description: Missing or invalid API key
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
 * @swagger
 * /api/admin/stats/jobs-by-source:
 *   get:
 *     tags: [Stats]
 *     summary: Job counts grouped by source
 *     description: Returns job counts per scraper source, with valid/discarded splits and 7-day/30-day trends.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Job counts by source
 *       401:
 *         description: Missing or invalid API key
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
 * @swagger
 * /api/admin/health-check/send-digest:
 *   post:
 *     tags: [Stats]
 *     summary: Run health check and send email digest
 *     description: Runs the full database health check AND sends the result as an email digest to the admin.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Health check completed and email sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 emailSent: { type: boolean }
 *                 emailId: { type: string, nullable: true }
 *                 processingTime: { type: number }
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     ok: { type: integer }
 *                     warning: { type: integer }
 *                     critical: { type: integer }
 *                 overallSeverity: { type: string }
 *       401:
 *         description: Missing or invalid API key
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
 * @swagger
 * /api/admin/jobs:
 *   get:
 *     tags: [Jobs]
 *     summary: List jobs with filters
 *     description: |
 *       Paginated list of scraped and AI-generated jobs. Each job includes the linked company name.
 *       Filter by source (indeed, linkedin, arbetsformedlingen), AI validity, or date range.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: source
 *         schema: { type: string, enum: [indeed, linkedin, arbetsformedlingen, website_form] }
 *         description: Filter by scraper source
 *       - in: query
 *         name: ai_valid
 *         schema: { type: string, enum: ['true', 'false'] }
 *         description: Filter by AI validity (true = valid for Rookie target market)
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date }
 *         description: Filter jobs posted on or after this date (YYYY-MM-DD)
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date }
 *         description: Filter jobs posted on or before this date (YYYY-MM-DD)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *         description: Number of results to skip (for pagination)
 *     responses:
 *       200:
 *         description: Paginated list of jobs
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/JobSummary'
 *       401:
 *         description: Missing or invalid API key
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
 * @swagger
 * /api/admin/jobs/{id}:
 *   get:
 *     tags: [Jobs]
 *     summary: Get a single job by ID
 *     description: Returns the full job record including all AI evaluation fields, raw data, and the linked company.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Job UUID
 *     responses:
 *       200:
 *         description: Full job details
 *       404:
 *         description: Job not found
 *       401:
 *         description: Missing or invalid API key
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
 * @swagger
 * /api/admin/companies:
 *   get:
 *     tags: [Companies]
 *     summary: List companies with counts
 *     description: |
 *       Paginated list of companies. Each entry includes aggregated counts of related jobs, signals, and contacts.
 *       Companies are created automatically when scrapers find new employers.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [backlog, active, inactive] }
 *         description: Filter by company status
 *       - in: query
 *         name: source
 *         schema: { type: string }
 *         description: Filter by source (e.g. indeed, google_maps)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Paginated list of companies
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/CompanySummary'
 *       401:
 *         description: Missing or invalid API key
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
 * @swagger
 * /api/admin/companies/{id}:
 *   get:
 *     tags: [Companies]
 *     summary: Get a single company by ID
 *     description: Returns the full company record with all related jobs, signals, and contacts nested inside.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Company UUID
 *     responses:
 *       200:
 *         description: Full company details with related data
 *       404:
 *         description: Company not found
 *       401:
 *         description: Missing or invalid API key
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
 * @swagger
 * /api/admin/contacts:
 *   get:
 *     tags: [Contacts]
 *     summary: List contacts with company info
 *     description: |
 *       Paginated list of extracted contacts. Each contact includes the linked company.
 *       Filter by source (indeed, linkedin, google_maps) or source_method (api_extracted, ai_extracted).
 *
 *       **source_method explained:**
 *       - `api_extracted` — contact details came from the scraper API response (e.g. Apify returned them)
 *       - `ai_extracted` — AI read the contact email from the job description text
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: source
 *         schema: { type: string, enum: [indeed, linkedin, arbetsformedlingen, google_maps, website_form] }
 *         description: Filter by scraper source
 *       - in: query
 *         name: source_method
 *         schema: { type: string, enum: [api_extracted, ai_extracted] }
 *         description: Filter by extraction method
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Paginated list of contacts
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ContactSummary'
 *       401:
 *         description: Missing or invalid API key
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
 * @swagger
 * /api/admin/signals:
 *   get:
 *     tags: [Signals]
 *     summary: List signals with company info
 *     description: |
 *       Paginated list of recruitment signals. Each signal represents a piece of recruitment intent
 *       (e.g. a job posting, a form submission, a Google Maps listing). Includes the linked company.
 *
 *       **Common signal_type values:** `indeed_job_ad`, `linkedin_job_ad`, `arbetsformedlingen_job_ad`,
 *       `google_maps_listing`, `website_form_submission`
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: source
 *         schema: { type: string }
 *         description: Filter by source (indeed, linkedin, arbetsformedlingen, google_maps, website_form)
 *       - in: query
 *         name: signal_type
 *         schema: { type: string }
 *         description: Filter by signal type (indeed_job_ad, google_maps_listing, etc.)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Paginated list of signals
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/SignalSummary'
 *       401:
 *         description: Missing or invalid API key
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
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     tags: [Dashboard]
 *     summary: Dashboard summary numbers
 *     description: |
 *       Returns key numbers for a dashboard overview card: total companies, jobs, contacts, signals,
 *       plus this-week counts for companies, jobs, and signals. All counts are fetched in parallel.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   $ref: '#/components/schemas/DashboardSummary'
 *       401:
 *         description: Missing or invalid API key
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

/**
 * @swagger
 * /api/admin/alerts:
 *   get:
 *     tags: [Alerts]
 *     summary: List system alerts
 *     description: |
 *       Paginated list of system alerts (pipeline failures, AI fallbacks, email errors).
 *       Defaults to the last 7 days. Filter by source, severity, or custom date range.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *           enum: [webhook, indeed_scraper, linkedin_scraper, arbetsformedlingen_scraper, google_maps_scraper, email_service]
 *         description: Filter by alert source
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [critical, warning, info]
 *         description: Filter by severity level
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start of date range (default last 7 days)
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End of date range
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Paginated list of system alerts
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const { source, severity, from_date, to_date, limit, offset } = req.query;

    const result = await getAlerts({
      source: source as string | undefined,
      severity: severity as string | undefined,
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
    logger.error('Failed to fetch alerts', error);

    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

export default router;
