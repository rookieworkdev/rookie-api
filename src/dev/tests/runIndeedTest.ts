// /dev/tests/runIndeedTest.ts
/**
 * Manual test script to run the Indeed scraper locally.
 *
 * Usage:
 * 1. Start your dev server if needed (optional, not required for this script):
 *    pnpm run dev
 * 2. Run this script from the project root:
 *    pnpm exec tsx src/dev/tests/runIndeedTest.ts
 *
 * This will:
 * - Fetch jobs from Apify via runIndeedFetch()
 * - Process them through the AI/LLM pipeline via runJobProcessingPipeline()
 * - Write results to your database
 * - Send the digest email
 *
 * NOTE: This script is for local testing only. Do NOT deploy it to production.
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
