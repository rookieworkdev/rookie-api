/**
 * Test 6a: AI failure simulation
 *
 * Calls processJob directly with a test job. With OPENROUTER_API_KEY set to invalid,
 * the AI evaluation should fail and the fallback should kick in:
 * - Job saved with ai_category='AI Evaluation Failed'
 * - system_alerts row created with stage='ai_evaluation', severity='warning'
 *
 * Run: pnpm exec tsx src/dev/scraper-tests/testAIFailure.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/env.js';
import { processJob } from '../../services/jobs/jobProcessor.js';
import { findOrCreateCompany } from '../../services/supabaseService.js';
import type { NormalizedJob } from '../../types/scraper.types.js';

const supabase = createClient(config.supabase.url, config.supabase.key!);

const TEST_COMPANY = '__TEST_AI_FAILURE_CO__';
const TEST_DOMAIN = '__test-ai-failure__.test';

let failures = 0;
const pass = (msg: string) => console.log(`   ✅ PASS: ${msg}`);
const fail = (msg: string) => {
  console.log(`   ❌ FAIL: ${msg}`);
  failures++;
};

async function cleanup(companyId: string) {
  await supabase.from('contacts').delete().eq('company_id', companyId);
  await supabase.from('scraping_signals').delete().eq('company_id', companyId);
  await supabase.from('jobs').delete().eq('company_id', companyId);
  await supabase.from('system_alerts').delete().ilike('message', '%test-ai-failure%');
  await supabase.from('companies').delete().eq('id', companyId);
}

async function run() {
  console.log('=== Test 6a: AI Failure Simulation ===\n');
  console.log(`OpenRouter key: ${config.openRouter.apiKey?.slice(0, 10)}...`);

  // Record alert count before
  const { count: alertsBefore } = await supabase
    .from('system_alerts')
    .select('*', { count: 'exact', head: true });

  console.log(`System alerts before: ${alertsBefore}\n`);

  const testJob: NormalizedJob = {
    externalId: `__test_ai_fail_${Date.now()}`,
    title: '__TEST AI Failure Job - Ekonomiassistent__',
    company: TEST_COMPANY,
    location: 'Stockholm',
    description: 'Test job to verify AI failure fallback. This is a test-ai-failure simulation.',
    url: `https://test.example.com/job/__test_ai_fail_${Date.now()}`,
    source: 'arbetsformedlingen',
    jobType: 'Full-time',
    postedAt: new Date().toISOString(),
    rawData: { test: true, simulation: 'ai_failure' },
  };

  console.log('── Processing job with (hopefully) broken AI key ──');
  const result = await processJob(testJob);

  // Wait a moment for fire-and-forget alert to be inserted
  await new Promise((r) => setTimeout(r, 2000));

  // Check 1: Job was processed (success=true means no crash, even with fallback)
  if (result.success) {
    pass('processJob completed without crashing');
  } else {
    // If AI fails AND processJob itself errors, that's still acceptable
    // as long as the fallback eval is present
    console.log('   ⚠️  processJob returned success=false (full pipeline error)');
  }

  // Check 2: Evaluation is fallback
  if (result.evaluation.category === 'AI Evaluation Failed') {
    pass(`ai_category = "AI Evaluation Failed"`);
  } else {
    fail(`Expected "AI Evaluation Failed", got "${result.evaluation.category}" — AI key may not be broken`);
  }

  if (result.evaluation.score === 0) {
    pass('ai_score = 0 (fallback)');
  } else {
    fail(`Expected score=0, got ${result.evaluation.score}`);
  }

  // Check 3: Job exists in DB with fallback data
  if (result.jobAdId) {
    const { data: jobRow } = await supabase
      .from('jobs')
      .select('ai_category, ai_valid, ai_score, ai_reasoning, raw_data')
      .eq('id', result.jobAdId)
      .single();

    if (jobRow?.ai_category === 'AI Evaluation Failed') {
      pass('DB row has ai_category="AI Evaluation Failed"');
    } else {
      fail(`DB ai_category: "${jobRow?.ai_category}"`);
    }

    if (jobRow?.raw_data) {
      pass('raw_data preserved in DB');
    } else {
      fail('raw_data missing from DB');
    }
  } else {
    fail('No jobAdId returned — job may not have been saved');
  }

  // Check 4: system_alerts row created
  const { count: alertsAfter } = await supabase
    .from('system_alerts')
    .select('*', { count: 'exact', head: true });

  console.log(`\n   System alerts after: ${alertsAfter}`);

  if (alertsAfter !== null && alertsBefore !== null && alertsAfter > alertsBefore) {
    pass(`New alert(s) created: ${alertsAfter - alertsBefore}`);

    // Fetch the newest alert
    const { data: alert } = await supabase
      .from('system_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (alert) {
      console.log(`\n   Alert details:`);
      console.log(`     source:   ${alert.source}`);
      console.log(`     stage:    ${alert.stage}`);
      console.log(`     severity: ${alert.severity}`);
      console.log(`     title:    ${alert.title}`);
      console.log(`     message:  ${alert.message.slice(0, 100)}...`);

      if (alert.stage === 'ai_evaluation') {
        pass('Alert stage = ai_evaluation');
      } else {
        fail(`Expected stage=ai_evaluation, got ${alert.stage}`);
      }
      if (alert.severity === 'warning') {
        pass('Alert severity = warning');
      } else {
        fail(`Expected severity=warning, got ${alert.severity}`);
      }
    }
  } else {
    fail('No new system_alerts row created');
  }

  // Summary
  console.log(`\n=== ${failures === 0 ? 'ALL TESTS PASSED ✅' : `${failures} FAILURE(S) ❌`} ===`);

  // Cleanup
  console.log('\nCleanup: Removing test data...');
  if (result.companyId) {
    await cleanup(result.companyId);
  }
  console.log('Done.');

  if (failures > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
