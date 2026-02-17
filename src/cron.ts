import cron from 'node-cron';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';

const BASE_URL = `http://localhost:${config.port}`;

/**
 * Calls a local API endpoint with the ROOKIE_API_KEY header.
 * Used by cron jobs to trigger scraper runs, cleanup, and digest emails.
 */
async function callEndpoint(name: string, method: string, path: string): Promise<void> {
  const url = `${BASE_URL}${path}`;
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
 *   00:00 Sunday — Expired job cleanup
 *   08:00 Monday — Health check digest email
 *
 * To add a new scraper: add one schedule() call below.
 */
export function startCronJobs(): void {
  // Job scrapers — staggered daily to avoid overlapping API calls
  cron.schedule('0 6 * * *', () => callEndpoint('Indeed scraper', 'POST', '/api/scraping/jobs/indeed'), {
    timezone: 'UTC',
  });

  cron.schedule('0 7 * * *', () => callEndpoint('LinkedIn scraper', 'POST', '/api/scraping/jobs/linkedin'), {
    timezone: 'UTC',
  });

  cron.schedule('0 8 * * *', () => callEndpoint('AF scraper', 'POST', '/api/scraping/jobs/af'), {
    timezone: 'UTC',
  });

  // Maintenance
  cron.schedule('0 0 * * 0', () => callEndpoint('Job cleanup', 'POST', '/api/scraping/jobs/cleanup'), {
    timezone: 'UTC',
  });

  // Health digest — weekly Monday morning
  cron.schedule('0 8 * * 1', () => callEndpoint('Health digest', 'POST', '/api/admin/health-check/send-digest'), {
    timezone: 'UTC',
  });

  logger.info('[cron] Scheduled 5 cron jobs', {
    jobs: [
      'Indeed (daily 06:00 UTC)',
      'LinkedIn (daily 07:00 UTC)',
      'AF (daily 08:00 UTC)',
      'Cleanup (Sunday 00:00 UTC)',
      'Health digest (Monday 08:00 UTC)',
    ],
  });
}
