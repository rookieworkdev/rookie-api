import cron from 'node-cron';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';

const BASE_URL = `http://localhost:${config.port}`;
const PLATFORM_URL = process.env.PLATFORM_URL || 'http://localhost:3000';

/**
 * Calls a local API endpoint with the ROOKIE_API_KEY header.
 * Used by cron jobs to trigger scraper runs, cleanup, and digest emails.
 */
async function callEndpoint(name: string, method: string, path: string, baseUrl = BASE_URL): Promise<void> {
  const url = `${baseUrl}${path}`;
  logger.info(`[cron] Starting: ${name}`, { path });

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.rookieApiKey || '',
      },
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (res.ok) {
      logger.info(`[cron] Completed: ${name}`, {
        status: res.status,
        ...(data.stats ? { stats: data.stats } : {}),
        ...(data.processingTime ? { processingTime: data.processingTime } : {}),
      });
    } else {
      logger.error(`[cron] Failed: ${name}`, undefined, {
        status: res.status,
        error: (data.error as string) || 'Unknown error',
      });
    }
  } catch (err) {
    logger.error(`[cron] Error: ${name}`, err instanceof Error ? err : undefined, { path });
  }
}

/**
 * Register all cron jobs. Call this after the server has started listening.
 *
 * Schedule overview (all times UTC):
 *   06:00 daily  — Indeed job scraper
 *   07:00 daily  — LinkedIn job scraper
 *   08:00 daily  — Arbetsförmedlingen job scraper
 *   10:00 Sunday — Google Maps lead scraper (weekly during dev, later every few months)
 *   00:00 Sunday — Expired job cleanup
 *   08:00 Monday — Health check digest email
 *
 * To add a new scraper: add one schedule() call below.
 */
export function startCronJobs(): void {
  const scraperEnabled = config.scraper?.enabled ?? true;
  const scheduledJobs: string[] = [];

  if (scraperEnabled) {
    // Job scrapers — staggered daily. Each is gated by its own flag so
    // a single scraper can be paused without touching the others.
    if (config.scraper.indeedEnabled) {
      cron.schedule('0 6 * * *', () => callEndpoint('Indeed scraper', 'POST', '/api/scraping/jobs/indeed'), {
        timezone: 'UTC',
      });
      scheduledJobs.push('Indeed (daily 06:00 UTC)');
    } else {
      logger.warn('[cron] INDEED_ENABLED=false — Indeed scraper cron skipped');
    }

    if (config.scraper.linkedinEnabled) {
      cron.schedule('0 7 * * *', () => callEndpoint('LinkedIn scraper', 'POST', '/api/scraping/jobs/linkedin'), {
        timezone: 'UTC',
      });
      scheduledJobs.push('LinkedIn (daily 07:00 UTC)');
    } else {
      logger.warn('[cron] LINKEDIN_ENABLED=false — LinkedIn scraper cron skipped');
    }

    if (config.scraper.afEnabled) {
      cron.schedule('0 8 * * *', () => callEndpoint('AF scraper', 'POST', '/api/scraping/jobs/af'), {
        timezone: 'UTC',
      });
      scheduledJobs.push('AF (daily 08:00 UTC)');
    } else {
      logger.warn('[cron] AF_ENABLED=false — Arbetsförmedlingen scraper cron skipped');
    }

    // Lead scrapers — weekly during development, reduce frequency once good coverage achieved
    if (config.scraper.googleMapsEnabled) {
      cron.schedule('0 10 * * 0', () => callEndpoint('Google Maps scraper', 'POST', '/api/scraping/leads/google-maps'), {
        timezone: 'UTC',
      });
      scheduledJobs.push('Google Maps (Sunday 10:00 UTC)');
    } else {
      logger.warn('[cron] GOOGLEMAPS_ENABLED=false — Google Maps scraper cron skipped');
    }

    // Maintenance (not gated per-scraper — cleanup is safe whenever scrapers are on)
    cron.schedule('0 0 * * 0', () => callEndpoint('Job cleanup', 'POST', '/api/scraping/jobs/cleanup'), {
      timezone: 'UTC',
    });
    scheduledJobs.push('Cleanup (Sunday 00:00 UTC)');
  } else {
    logger.warn('[cron] SCRAPER_ENABLED=false — all scraper and cleanup cron jobs skipped');
  }

  // Health digest — weekly Monday morning (always runs, read-only)
  cron.schedule('0 8 * * 1', () => callEndpoint('Health digest', 'POST', '/api/admin/health-check/send-digest'), {
    timezone: 'UTC',
  });
  scheduledJobs.push('Health digest (Monday 08:00 UTC)');

  // Match notifications — every 30 min, calls platform (Next.js) endpoint
  // Jobs must be 20+ min old to avoid immediate sends after scraping
  cron.schedule('*/30 * * * *', () => callEndpoint('Match notifications', 'GET', '/api/cron/match-notifications', PLATFORM_URL), {
    timezone: 'UTC',
  });
  scheduledJobs.push('Match notifications (every 30 min -> platform)');

  // Job expiration — hourly, calls platform endpoint to unpublish jobs past expires_at
  // and notify applicants (bell + email)
  cron.schedule('0 * * * *', () => callEndpoint('Job expiration', 'GET', '/api/cron/expire-jobs', PLATFORM_URL), {
    timezone: 'UTC',
  });
  scheduledJobs.push('Job expiration (hourly -> platform)');

  // Consent cleanup — daily 02:00 UTC, calls platform endpoint to purge candidates/companies
  // whose pending consent request has passed CONSENT_EXPIRY_DAYS (GDPR retention)
  cron.schedule('0 2 * * *', () => callEndpoint('Consent cleanup', 'GET', '/api/cron/consent-cleanup', PLATFORM_URL), {
    timezone: 'UTC',
  });
  scheduledJobs.push('Consent cleanup (daily 02:00 UTC -> platform)');

  logger.info(`[cron] Scheduled ${scheduledJobs.length} cron jobs (scrapers ${scraperEnabled ? 'ON' : 'OFF'})`, {
    jobs: scheduledJobs,
  });
}
