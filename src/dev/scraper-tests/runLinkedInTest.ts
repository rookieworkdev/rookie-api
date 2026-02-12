// ⚠️ DO NOT MOVE this file — it relies on relative import paths to src/services/ and src/utils/.
/**
 * Manual integration test: LinkedIn job scraper
 *
 * Runs the full LinkedIn scraper pipeline end-to-end:
 * 1. Fetches jobs from Apify across all 5 categories, deduplicated (costs Apify credits)
 * 2. Processes them through the AI/LLM evaluation pipeline
 * 3. Writes results to Supabase (jobs, signals, contacts, companies)
 * 4. Sends the digest email via Resend
 *
 * Requires: .env with APIFY_TOKEN, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY, RESEND_API_KEY
 *
 * Run from project root:
 *   pnpm test:linkedin
 *   (or: pnpm exec tsx src/dev/scraper-tests/runLinkedInTest.ts)
 *
 * NOTE: For local testing only. Do NOT deploy to production.
 */

import { runLinkedInFetch } from '../../services/jobs/linkedinJobScraper.js'
import { runJobProcessingPipeline } from '../../services/jobs/jobProcessor.js'
import { sendJobScraperDigestEmail } from '../../services/emailService.js'
import { logger } from '../../utils/logger.js'

async function main() {
	try {
		logger.info('Starting manual LinkedIn scraper test run')

		// 1. Fetch jobs from Apify (all 5 categories)
		console.log('--- Starting job fetch ---')
		const { jobs, raw } = await runLinkedInFetch({
			maxItems: 10, // per category; adjust if needed
		})

		raw.forEach((job, i) => {
			console.log(`>>> Fetched job ${i + 1}/${raw.length}: ${job.title || 'No title'}`)
		})
		console.log('--- Job fetch complete ---')
		logger.info(`Fetched ${jobs.length} jobs from LinkedIn (${raw.length} raw, deduplicated)`)

		// 2. Process jobs through AI/LLM pipeline
		console.log('--- Starting LLM processing ---')
		const result = await runJobProcessingPipeline(jobs, 'linkedin')
		console.log(`>>> Processing ${jobs.length} jobs through LLM pipeline...`)
		console.log('--- LLM processing complete ---')

		logger.info('Job processing pipeline complete', { runId: result.runId, stats: result.stats })

		// 3. Send email digest (optional)
		await sendJobScraperDigestEmail(result).catch((err) => {
			logger.error('Failed to send scraper digest email', err)
		})

		logger.info('Manual LinkedIn scraper test run complete')
		console.log('Summary:', {
			runId: result.runId,
			stats: result.stats,
			newJobsFound: result.stats.afterDedup,
			validJobs: result.stats.valid,
			discardedJobs: result.stats.discarded,
			errors: result.stats.errors,
		})
	} catch (err) {
		logger.error('Error during manual LinkedIn scraper test run', err)
		process.exit(1)
	}
}

// Run the script
main()
