// /dev/tests/runGoogleMapsTest.ts
/**
 * Manual test script to run the Google Maps lead scraper locally.
 *
 * Usage:
 * 1. Start your dev server if needed (optional, not required for this script):
 *    pnpm run dev
 * 2. Run this script from the project root:
 *    pnpm exec tsx src/dev/tests/runGoogleMapsTest.ts
 *
 * This will:
 * - Fetch companies from Google Maps via Apify (costs Apify credits)
 * - Filter for Swedish companies with websites
 * - Score each company with AI (Gemini Flash Lite via OpenRouter)
 * - Create company/signal/contact records in the database
 * - Send the digest email
 *
 * NOTE: This script is for local testing only. Do NOT deploy it to production.
 */

import { runGoogleMapsFetch } from '../../services/leads/googleMapsScraper.js'
import { sendLeadScraperDigestEmail } from '../../services/emailService.js'
import { logger } from '../../utils/logger.js'

async function main() {
	try {
		logger.info('Starting manual Google Maps lead scraper test run')

		// Use 3 test queries with small result set to limit Apify costs
		const testQueries = [
			'juristfirma Stockholm',
			'strategikonsult Stockholm',
			'it-bolag Stockholm',
		]

		console.log('--- Starting Google Maps lead pipeline ---')
		console.log(`>>> Search queries: ${testQueries.join(', ')}`)
		console.log(`>>> Max items per query: 4`)

		const result = await runGoogleMapsFetch({
			searchQueries: testQueries,
			maxItemsPerQuery: 4,
		})

		console.log('--- Pipeline complete ---')

		// Log valid companies
		if (result.validCompanies.length > 0) {
			console.log(`\n--- Valid Prospects (${result.validCompanies.length}) ---`)
			result.validCompanies.forEach((c, i) => {
				console.log(`  ${i + 1}. ${c.company.name} (${c.company.domain}) - Score: ${c.evaluation.score} - ${c.evaluation.industryCategory}`)
				c.company.leads.slice(0, 2).forEach((lead) => {
					console.log(`     -> ${lead.fullName || 'Unknown'} - ${lead.jobTitle || 'No title'}`)
				})
			})
		}

		// Log discarded companies
		if (result.discardedCompanies.length > 0) {
			console.log(`\n--- Discarded (${result.discardedCompanies.length}) ---`)
			result.discardedCompanies.forEach((c, i) => {
				console.log(`  ${i + 1}. ${c.company.name} - Score: ${c.evaluation.score} - ${c.evaluation.reasoning.substring(0, 80)}`)
			})
		}

		// Log errors
		if (result.errors.length > 0) {
			console.log(`\n--- Errors (${result.errors.length}) ---`)
			result.errors.forEach((e, i) => {
				console.log(`  ${i + 1}. ${e.company?.name || 'Unknown'}: ${e.error}`)
			})
		}

		logger.info('Google Maps pipeline complete', { runId: result.runId, stats: result.stats })

		// Send email digest
		console.log('\n--- Sending digest email ---')
		await sendLeadScraperDigestEmail(result).catch((err) => {
			logger.error('Failed to send lead scraper digest email', err)
		})

		logger.info('Manual Google Maps lead scraper test run complete')
		console.log('\nSummary:', {
			runId: result.runId,
			stats: result.stats,
			companiesEvaluated: result.stats.processed,
			validProspects: result.stats.valid,
			contactsCreated: result.stats.contactsCreated,
			discarded: result.stats.discarded,
			errors: result.stats.errors,
		})
	} catch (err) {
		logger.error('Error during manual Google Maps lead scraper test run', err)
		process.exit(1)
	}
}

// Run the script
main()
