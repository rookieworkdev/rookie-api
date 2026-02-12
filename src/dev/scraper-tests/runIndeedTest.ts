// ⚠️ DO NOT MOVE this file — it relies on relative import paths to src/services/ and src/utils/.
/**
 * Manual integration test: Indeed job scraper
 *
 * Runs the full Indeed scraper pipeline end-to-end:
 * 1. Fetches jobs from Apify (costs Apify credits)
 * 2. Processes them through the AI/LLM evaluation pipeline
 * 3. Writes results to Supabase (job_ads, signals, contacts, companies)
 * 4. Sends the digest email via Resend
 *
 * Requires: .env with APIFY_TOKEN, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY, RESEND_API_KEY
 *
 * Run from project root:
 *   pnpm test:indeed
 *   (or: pnpm exec tsx src/dev/scraper-tests/runIndeedTest.ts)
 *
 * NOTE: For local testing only. Do NOT deploy to production.
 */

import { runIndeedFetch } from '../../services/jobs/indeedJobScraper.js' // your existing fetch function
import { runJobProcessingPipeline } from '../../services/jobs/jobProcessor.js' // your existing AI/job processor
import { sendJobScraperDigestEmail } from '../../services/emailService.js' // optional email sending
import { logger } from '../../utils/logger.js' // optional logging

async function main() {
	try {
		logger.info('Starting manual Indeed scraper test run')

		// 1. Fetch jobs from Apify
		console.log('--- Starting job fetch ---')
		const { jobs, raw } = await runIndeedFetch({
			country: 'SE', // default to Sweden; adjust if needed
			maxItems: 50, // number of jobs to fetch; adjust if needed
		})

		raw.forEach((job, i) => {
			console.log(`>>> Fetched job ${i + 1}/${raw.length}: ${job.positionName || 'No title'}`)
		})
		console.log('--- Job fetch complete ---')
		logger.info(`Fetched ${jobs.length} jobs from Indeed`)

		// 2. Process jobs through AI/LLM pipeline
		console.log('--- Starting LLM processing ---')
		const result = await runJobProcessingPipeline(jobs, 'indeed')
		console.log(`>>> Processing ${jobs.length} jobs through LLM pipeline...`)
		console.log('--- LLM processing complete ---')

		logger.info('Job processing pipeline complete', { runId: result.runId, stats: result.stats })

		// 3. Send email digest (optional)
		await sendJobScraperDigestEmail(result).catch((err) => {
			logger.error('Failed to send scraper digest email', err)
		})

		logger.info('Manual Indeed scraper test run complete')
		console.log('Summary:', {
			runId: result.runId,
			stats: result.stats,
			newJobsFound: result.stats.afterDedup,
			validJobs: result.stats.valid,
			discardedJobs: result.stats.discarded,
			errors: result.stats.errors,
		})
	} catch (err) {
		logger.error('Error during manual Indeed scraper test run', err)
		process.exit(1)
	}
}

// Run the script
main()
