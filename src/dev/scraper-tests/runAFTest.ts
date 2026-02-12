// ⚠️ DO NOT MOVE this file — it relies on relative import paths to src/services/ and src/utils/.
/**
 * Manual integration test: Arbetsformedlingen (AF) job scraper
 *
 * Runs the full AF scraper pipeline end-to-end:
 * 1. Fetches jobs from the free JobTech API (no auth/credits needed, paginates automatically)
 * 2. Processes them through the AI/LLM evaluation pipeline
 * 3. Writes results to Supabase (jobs, signals, contacts, companies)
 * 4. Sends the digest email via Resend
 *
 * Requires: .env with OPENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY, RESEND_API_KEY
 * (No Apify token needed — AF uses the public JobTech API)
 *
 * Run from project root:
 *   pnpm test:af
 *   (or: pnpm exec tsx src/dev/scraper-tests/runAFTest.ts)
 *
 * NOTE: For local testing only. Do NOT deploy to production.
 */

import { runAFFetch } from '../../services/jobs/afJobScraper.js'
import { runJobProcessingPipeline } from '../../services/jobs/jobProcessor.js'
import { sendJobScraperDigestEmail } from '../../services/emailService.js'
import { logger } from '../../utils/logger.js'

async function main() {
	try {
		logger.info('Starting manual AF scraper test run')

		// 1. Fetch jobs from JobTech API
		console.log('--- Starting job fetch ---')
		const { jobs, raw } = await runAFFetch({
			maxItems: 100, // adjust as needed; paginates automatically if > 100
		})

		raw.forEach((job, i) => {
			console.log(`>>> Fetched job ${i + 1}/${raw.length}: ${job.headline || 'No title'}`)
		})
		console.log('--- Job fetch complete ---')
		logger.info(`Fetched ${jobs.length} jobs from AF (${raw.length} raw)`)

		// 2. Process jobs through AI/LLM pipeline
		console.log('--- Starting LLM processing ---')
		const result = await runJobProcessingPipeline(jobs, 'arbetsformedlingen')
		console.log(`>>> Processing ${jobs.length} jobs through LLM pipeline...`)
		console.log('--- LLM processing complete ---')

		logger.info('Job processing pipeline complete', { runId: result.runId, stats: result.stats })

		// 3. Send email digest (optional)
		await sendJobScraperDigestEmail(result).catch((err) => {
			logger.error('Failed to send scraper digest email', err)
		})

		logger.info('Manual AF scraper test run complete')
		console.log('Summary:', {
			runId: result.runId,
			stats: result.stats,
			newJobsFound: result.stats.afterDedup,
			validJobs: result.stats.valid,
			discardedJobs: result.stats.discarded,
			errors: result.stats.errors,
		})
	} catch (err) {
		logger.error('Error during manual AF scraper test run', err)
		process.exit(1)
	}
}

// Run the script
main()
