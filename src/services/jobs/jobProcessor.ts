import { v4 as uuidv4 } from 'uuid';
import { logger, getErrorMessage } from '../../utils/logger.js';
import { evaluateJob } from '../aiService.js';
import {
  findOrCreateCompany,
  findExistingJobsBySource,
  createJobAdFromScraper,
  createSignalForJobAd,
  upsertScrapedContact,
} from '../supabaseService.js';
import { guessCompanyDomain } from './scraperUtils.js';
import type {
  NormalizedJob,
  JobEvaluationResult,
  ProcessedJob,
  ScraperRunResult,
  ExtractedContact,
  JobScraperSource,
} from '../../types/scraper.types.js';

/**
 * Deduplicate jobs against existing database records
 */
export async function deduplicateJobs(
  jobs: NormalizedJob[],
  source: JobScraperSource
): Promise<NormalizedJob[]> {
  const existingIds = await findExistingJobsBySource(source);

  const newJobs = jobs.filter((job) => {
    const isDuplicate = existingIds.has(job.externalId) || existingIds.has(job.url);
    if (isDuplicate) {
      logger.debug('Skipping duplicate job', { externalId: job.externalId, title: job.title });
    }
    return !isDuplicate;
  });

  logger.info('Deduplication complete', {
    source,
    before: jobs.length,
    after: newJobs.length,
    duplicates: jobs.length - newJobs.length,
  });

  return newJobs;
}

/**
 * Extract contact from job evaluation result
 */
function extractContactFromJob(
  job: NormalizedJob,
  evaluation: JobEvaluationResult,
  companyId: string,
  jobAdId: string
): ExtractedContact | null {
  const email = evaluation.applicationEmail;

  // Skip if no valid email found
  if (!email || email === 'Email Not Found' || !email.includes('@')) {
    return null;
  }

  // Try to extract name from email
  const localPart = email.split('@')[0];
  const parts = localPart.split(/[._-]/);

  let firstName: string | undefined;
  let lastName: string | undefined;
  let fullName = 'Application Contact';

  if (parts.length >= 2) {
    firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    lastName = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
    fullName = `${firstName} ${lastName}`;
  } else if (parts.length === 1 && parts[0].length > 0) {
    firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    fullName = firstName;
  }

  return {
    companyId,
    firstName,
    lastName,
    fullName,
    email: email.toLowerCase().trim(),
    source: `${job.source}_job_ad`,
    sourceMethod: 'ai_extracted',
    relatedJobAdId: jobAdId,
  };
}

/**
 * Process a single job through the pipeline
 */
export async function processJob(job: NormalizedJob): Promise<ProcessedJob> {
  try {
    // 1. Evaluate with AI
    const evaluation = await evaluateJob(job);

    // 2. Find or create company
    const guessedDomain = guessCompanyDomain(job.company);

    const companyId = await findOrCreateCompany(
      job.company,
      guessedDomain,
      job.source
    );

    // 3. Create job ad record
    const jobAdResult = await createJobAdFromScraper(job, companyId, evaluation);

    // 4. Create signal
    const signalResult = await createSignalForJobAd(
      companyId,
      jobAdResult.id,
      job,
      evaluation
    );

    // 5. Extract and upsert contact (if email found)
    const contact = extractContactFromJob(job, evaluation, companyId, jobAdResult.id);
    if (contact) {
      await upsertScrapedContact(contact);
    }

    return {
      job,
      evaluation,
      companyId,
      jobAdId: jobAdResult.id,
      signalId: signalResult.id,
      success: true,
    };
  } catch (error) {
    logger.error('Error processing job', error, { title: job.title, company: job.company });

    return {
      job,
      evaluation: {
        isValid: false,
        score: 0,
        category: 'Error',
        experience: '',
        experienceLogic: 'Error during processing',
        reasoning: getErrorMessage(error),
        applicationEmail: 'Email Not Found',
        duration: '',
      },
      companyId: '',
      jobAdId: '',
      signalId: '',
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Process jobs in batches with concurrency control
 */
export async function processJobBatch(
  jobs: NormalizedJob[],
  concurrency: number = 3
): Promise<ProcessedJob[]> {
  const results: ProcessedJob[] = [];

  // Process in chunks to control concurrency
  for (let i = 0; i < jobs.length; i += concurrency) {
    const chunk = jobs.slice(i, i + concurrency);

    const chunkResults = await Promise.all(chunk.map(processJob));

    results.push(...chunkResults);

    logger.info('Batch progress', {
      completed: Math.min(i + concurrency, jobs.length),
      total: jobs.length,
      successRate: `${results.filter((r) => r.success).length}/${results.length}`,
    });
  }

  return results;
}

/**
 * Run the full job processing pipeline
 */
export async function runJobProcessingPipeline(
  jobs: NormalizedJob[],
  source: JobScraperSource
): Promise<ScraperRunResult> {
  const runId = uuidv4();
  const startTime = new Date();

  logger.info('Starting job processing pipeline', {
    runId,
    source,
    jobCount: jobs.length,
  });

  try {
    // 1. Deduplicate
    const newJobs = await deduplicateJobs(jobs, source);

    if (newJobs.length === 0) {
      logger.info('No new jobs to process after deduplication', { runId });

      return {
        source,
        runId,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        stats: {
          fetched: jobs.length,
          afterDedup: 0,
          afterFilter: 0,
          processed: 0,
          valid: 0,
          discarded: 0,
          errors: 0,
        },
        validJobs: [],
        discardedJobs: [],
        errors: [],
      };
    }

    // 2. Process all jobs
    const processedJobs = await processJobBatch(newJobs);

    // 3. Separate valid and discarded
    const validJobs = processedJobs.filter((p) => p.success && p.evaluation.isValid);
    const discardedJobs = processedJobs.filter((p) => p.success && !p.evaluation.isValid);
    const errors = processedJobs
      .filter((p) => !p.success)
      .map((p) => ({ job: p.job, error: p.error || 'Unknown error' }));

    const endTime = new Date();

    const result: ScraperRunResult = {
      source,
      runId,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      stats: {
        fetched: jobs.length,
        afterDedup: newJobs.length,
        afterFilter: newJobs.length, // Already filtered in scraper
        processed: processedJobs.length,
        valid: validJobs.length,
        discarded: discardedJobs.length,
        errors: errors.length,
      },
      validJobs,
      discardedJobs,
      errors,
    };

    logger.info('Job processing pipeline complete', {
      runId,
      source,
      duration: result.duration,
      stats: result.stats,
    });

    return result;
  } catch (error) {
    logger.error('Job processing pipeline failed', error, { runId });

    return {
      source,
      runId,
      startTime,
      endTime: new Date(),
      duration: Date.now() - startTime.getTime(),
      stats: {
        fetched: jobs.length,
        afterDedup: 0,
        afterFilter: 0,
        processed: 0,
        valid: 0,
        discarded: 0,
        errors: 1,
      },
      validJobs: [],
      discardedJobs: [],
      errors: [{ error: getErrorMessage(error) }],
    };
  }
}
