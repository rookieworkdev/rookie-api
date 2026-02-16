// ⚠️ DO NOT MOVE this file — it relies on relative import paths to src/services/ and src/utils/.
/**
 * Integration test: Data preservation & failure notification fixes
 *
 * Tests:
 * 1. api_extracted contact is NOT overwritten by ai_extracted upsert
 * 2. ai_extracted → ai_extracted upsert still works (no false protection)
 * 3. New contact with ai_extracted is created normally (no existing row)
 * 4. Fallback evaluation object is accepted by createJobAdFromScraper
 * 5. sendScraperFailureAlert sends an email without throwing
 *
 * Requires: .env with SUPABASE_URL, SUPABASE_KEY, RESEND_API_KEY
 *
 * Run from project root:
 *   pnpm exec tsx src/dev/scraper-tests/testDataPreservation.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/env.js';
import {
  findOrCreateCompany,
  upsertScrapedContact,
  createJobAdFromScraper,
} from '../../services/supabaseService.js';
import { sendScraperFailureAlert } from '../../services/emailService.js';
import type { NormalizedJob, JobEvaluationResult } from '../../types/scraper.types.js';

const supabase = createClient(config.supabase.url, config.supabase.key!);

const TEST_COMPANY_NAME = '__TEST_DATA_PRESERVATION_CO__';
const TEST_DOMAIN = '__test-data-preservation__.test';

let failures = 0;
const pass = (msg: string) => console.log(`   ✅ PASS: ${msg}`);
const fail = (msg: string) => {
  console.log(`   ❌ FAIL: ${msg}`);
  failures++;
};

async function cleanup(companyId: string) {
  // Delete in order: contacts, jobs (scraping_signals have cascade), scraping_signals, then company
  await supabase.from('contacts').delete().eq('company_id', companyId);
  await supabase.from('scraping_signals').delete().eq('company_id', companyId);
  await supabase.from('jobs').delete().eq('company_id', companyId);
  await supabase.from('companies').delete().eq('id', companyId);
}

async function run() {
  console.log('=== Data Preservation Integration Tests ===\n');

  console.log('Setup: Creating test company...');
  const companyId = await findOrCreateCompany(TEST_COMPANY_NAME, TEST_DOMAIN, 'test');
  console.log(`   Company: ${companyId}\n`);

  try {
    // ── Test 1: api_extracted is NOT overwritten by ai_extracted ───────
    console.log('── Test 1: api_extracted protected from ai_extracted overwrite ──');
    console.log('   Step A: Insert contact with source_method=api_extracted');
    await upsertScrapedContact({
      companyId,
      fullName: 'Erik Lindgren',
      firstName: 'Erik',
      lastName: 'Lindgren',
      email: 'erik.lindgren@test-preserve.se',
      source: 'linkedin_job_ad',
      sourceMethod: 'api_extracted',
    });

    const { data: after1a } = await supabase
      .from('contacts')
      .select('source_method, full_name')
      .eq('company_id', companyId)
      .eq('email', 'erik.lindgren@test-preserve.se')
      .single();

    if (after1a?.source_method === 'api_extracted') {
      pass('Initial contact created with api_extracted');
    } else {
      fail(`Expected api_extracted, got ${after1a?.source_method}`);
    }

    console.log('   Step B: Upsert same (company_id, email) with source_method=ai_extracted');
    await upsertScrapedContact({
      companyId,
      fullName: 'Erik Lindgren',
      email: 'erik.lindgren@test-preserve.se',
      source: 'indeed_job_ad',
      sourceMethod: 'ai_extracted',
    });

    const { data: after1b } = await supabase
      .from('contacts')
      .select('source_method, source')
      .eq('company_id', companyId)
      .eq('email', 'erik.lindgren@test-preserve.se')
      .single();

    if (after1b?.source_method === 'api_extracted') {
      pass('source_method still api_extracted — protected!');
    } else {
      fail(`source_method was overwritten to "${after1b?.source_method}"`);
    }
    if (after1b?.source === 'linkedin_job_ad') {
      pass('source field also preserved (not overwritten)');
    } else {
      fail(`source was overwritten to "${after1b?.source}"`);
    }

    await supabase.from('contacts').delete().eq('company_id', companyId);

    // ── Test 2: ai_extracted → ai_extracted upsert still works ────────
    console.log('\n── Test 2: ai_extracted → ai_extracted upsert still updates ──');
    await upsertScrapedContact({
      companyId,
      fullName: 'First Version',
      email: 'update-test@test-preserve.se',
      source: 'indeed_job_ad',
      sourceMethod: 'ai_extracted',
    });

    await upsertScrapedContact({
      companyId,
      fullName: 'Second Version',
      email: 'update-test@test-preserve.se',
      source: 'linkedin_job_ad',
      sourceMethod: 'ai_extracted',
    });

    const { data: after2 } = await supabase
      .from('contacts')
      .select('full_name, source')
      .eq('company_id', companyId)
      .eq('email', 'update-test@test-preserve.se')
      .single();

    if (after2?.full_name === 'Second Version') {
      pass('ai_extracted → ai_extracted upsert updated full_name');
    } else {
      fail(`Expected "Second Version", got "${after2?.full_name}"`);
    }

    await supabase.from('contacts').delete().eq('company_id', companyId);

    // ── Test 3: New ai_extracted contact is created normally ──────────
    console.log('\n── Test 3: New ai_extracted contact created when no existing row ──');
    await upsertScrapedContact({
      companyId,
      fullName: 'New Contact',
      email: 'brand-new@test-preserve.se',
      source: 'indeed_job_ad',
      sourceMethod: 'ai_extracted',
    });

    const { data: after3 } = await supabase
      .from('contacts')
      .select('source_method, full_name')
      .eq('company_id', companyId)
      .eq('email', 'brand-new@test-preserve.se')
      .single();

    if (after3?.source_method === 'ai_extracted' && after3?.full_name === 'New Contact') {
      pass('New ai_extracted contact created successfully');
    } else {
      fail(`Unexpected result: ${JSON.stringify(after3)}`);
    }

    await supabase.from('contacts').delete().eq('company_id', companyId);

    // ── Test 4: Fallback evaluation object works with DB insert ───────
    console.log('\n── Test 4: Fallback evaluation accepted by createJobAdFromScraper ──');

    const fallbackEval: JobEvaluationResult = {
      isValid: false,
      score: 0,
      category: 'AI Evaluation Failed',
      experience: '',
      experienceLogic: 'AI evaluation failed — saved for manual review',
      reasoning: 'AI evaluation error: Test fallback',
      applicationEmail: 'Email Not Found',
      duration: '',
    };

    const testJob: NormalizedJob = {
      externalId: `__test_fallback_${Date.now()}`,
      title: '__TEST Fallback Eval Job__',
      company: TEST_COMPANY_NAME,
      location: 'Stockholm',
      description: 'Test job for fallback evaluation integration test',
      url: `https://test.example.com/job/__test_fallback_${Date.now()}`,
      source: 'indeed',
      jobType: 'Full-time',
      postedAt: new Date().toISOString(),
      rawData: { test: true },
    };

    const jobResult = await createJobAdFromScraper(testJob, companyId, fallbackEval);

    if (jobResult?.id) {
      pass(`Job created with fallback eval (id: ${jobResult.id})`);
    } else {
      fail('createJobAdFromScraper returned no id');
    }

    // Verify the stored values
    const { data: jobRow } = await supabase
      .from('jobs')
      .select('ai_valid, ai_score, ai_category, ai_reasoning')
      .eq('id', jobResult.id)
      .single();

    if (jobRow?.ai_valid === false && jobRow?.ai_score === 0) {
      pass('ai_valid=false, ai_score=0 stored correctly');
    } else {
      fail(`Expected ai_valid=false/ai_score=0, got ${jobRow?.ai_valid}/${jobRow?.ai_score}`);
    }
    if (jobRow?.ai_category === 'AI Evaluation Failed') {
      pass('ai_category="AI Evaluation Failed" stored correctly');
    } else {
      fail(`Expected "AI Evaluation Failed", got "${jobRow?.ai_category}"`);
    }

    // ── Test 5: sendScraperFailureAlert doesn't throw ─────────────────
    console.log('\n── Test 5: sendScraperFailureAlert sends without throwing ──');
    try {
      const emailResult = await sendScraperFailureAlert(
        'integration_test',
        new Error('This is a test failure — please ignore'),
        { processingTime: 1234, step: 'test_step' }
      );

      if (emailResult === null) {
        pass('Function returned null (admin email may not be configured) — no crash');
      } else {
        pass(`Alert email sent successfully (id: ${emailResult.id})`);
      }
    } catch (err) {
      fail(`sendScraperFailureAlert threw: ${err}`);
    }

    // ── Summary ────────────────────────────────────────────────────
    console.log(`\n=== ${failures === 0 ? 'ALL TESTS PASSED ✅' : `${failures} FAILURE(S) ❌`} ===`);
  } finally {
    console.log('\nCleanup: Removing test data...');
    await cleanup(companyId);
    console.log('Done.');
  }

  if (failures > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
