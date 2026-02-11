// /dev/tests/runAFTest.ts
/**
 * Manual test script to run the Arbetsformedlingen scraper locally.
 *
 * Usage:
 * 1. Start your dev server if needed (optional, not required for this script):
 *    pnpm run dev
 * 2. Run this script from the project root:
 *    pnpm exec tsx src/dev/tests/runAFTest.ts
 *
 * This will:
 * - Fetch jobs from the JobTech API via runAFFetch() (public, no auth required)
 * - Process them through the AI/LLM pipeline via runJobProcessingPipeline()
 * - Write results to your database (job_ads, signals, contacts)
 * - Send the digest email
 *
 * NOTE: This script is for local testing only. Do NOT deploy it to production.
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
			maxItems: 100, // AF API default limit
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
