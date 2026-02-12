// ⚠️ DO NOT MOVE this file — it relies on relative import paths to src/services/ and src/utils/.
/**
 * Integration test: Multi-email split + generic name filter in upsertScrapedContact
 *
 * Tests:
 * 1. Comma-separated emails are split into separate contact rows (same company_id)
 * 2. Generic email prefixes (Info, Hr, Jobb, etc.) are cleared from name fields
 * 3. Real names are preserved normally
 * 4. Both features work together (multi-email + generic name)
 *
 * Requires: .env with SUPABASE_URL, SUPABASE_KEY
 *
 * Run from project root:
 *   pnpm exec tsx src/dev/scraper-tests/testMultiEmailSplit.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/env.js';
import { findOrCreateCompany, upsertScrapedContact } from '../../services/supabaseService.js';

const supabase = createClient(config.supabase.url, config.supabase.key!);

const TEST_COMPANY_NAME = '__TEST_CONTACT_QUALITY_CO__';
const TEST_DOMAIN = '__test-contact-quality__.test';

let failures = 0;
const pass = (msg: string) => console.log(`   ✅ PASS: ${msg}`);
const fail = (msg: string) => {
  console.log(`   ❌ FAIL: ${msg}`);
  failures++;
};

async function cleanup(companyId: string) {
  await supabase.from('contacts').delete().eq('company_id', companyId);
  await supabase.from('companies').delete().eq('id', companyId);
}

async function run() {
  console.log('=== Contact Quality Integration Tests ===\n');

  console.log('Setup: Creating test company...');
  const companyId = await findOrCreateCompany(TEST_COMPANY_NAME, TEST_DOMAIN, 'test');
  console.log(`   Company: ${companyId}\n`);

  try {
    // ── Test 1: Multi-email split ──────────────────────────────────
    console.log('── Test 1: Multi-email split ──');
    console.log('   Input: "anna@test.se, erik@test.se"');
    await upsertScrapedContact({
      companyId,
      fullName: 'Anna Svensson',
      email: 'anna@test.se, erik@test.se',
      source: 'test',
      sourceMethod: 'ai_extracted',
    });

    const { data: t1 } = await supabase
      .from('contacts')
      .select('email, full_name')
      .eq('company_id', companyId)
      .order('email');

    if (t1?.length === 2) {
      pass(`2 rows created`);
    } else {
      fail(`Expected 2 rows, got ${t1?.length}`);
    }
    if (t1?.every((c) => !c.email.includes(','))) {
      pass('No commas in email fields');
    } else {
      fail('Comma found in email field');
    }
    if (t1?.every((c) => c.full_name === 'Anna Svensson')) {
      pass('Both rows have real name "Anna Svensson"');
    } else {
      fail(`Unexpected names: ${t1?.map((c) => c.full_name).join(', ')}`);
    }

    // Clean contacts for next test
    await supabase.from('contacts').delete().eq('company_id', companyId);

    // ── Test 2: Generic name is cleared ────────────────────────────
    console.log('\n── Test 2: Generic name "Info" is cleared ──');
    console.log('   Input: fullName="Info", email="info@test.se"');
    await upsertScrapedContact({
      companyId,
      fullName: 'Info',
      firstName: 'Info',
      email: 'info@test.se',
      source: 'test',
      sourceMethod: 'ai_extracted',
    });

    const { data: t2 } = await supabase
      .from('contacts')
      .select('email, full_name, first_name, last_name')
      .eq('company_id', companyId)
      .single();

    if (t2?.email === 'info@test.se') {
      pass('Email preserved: info@test.se');
    } else {
      fail(`Expected info@test.se, got ${t2?.email}`);
    }
    if (t2?.full_name === null) {
      pass('full_name cleared to null');
    } else {
      fail(`Expected full_name=null, got "${t2?.full_name}"`);
    }
    if (t2?.first_name === null) {
      pass('first_name cleared to null');
    } else {
      fail(`Expected first_name=null, got "${t2?.first_name}"`);
    }

    await supabase.from('contacts').delete().eq('company_id', companyId);

    // ── Test 3: Real name is preserved ─────────────────────────────
    console.log('\n── Test 3: Real name "Anna Svensson" is preserved ──');
    console.log('   Input: fullName="Anna Svensson", email="anna.svensson@test.se"');
    await upsertScrapedContact({
      companyId,
      fullName: 'Anna Svensson',
      firstName: 'Anna',
      lastName: 'Svensson',
      email: 'anna.svensson@test.se',
      source: 'test',
      sourceMethod: 'ai_extracted',
    });

    const { data: t3 } = await supabase
      .from('contacts')
      .select('email, full_name, first_name, last_name')
      .eq('company_id', companyId)
      .single();

    if (t3?.full_name === 'Anna Svensson') {
      pass('full_name preserved: "Anna Svensson"');
    } else {
      fail(`Expected "Anna Svensson", got "${t3?.full_name}"`);
    }
    if (t3?.first_name === 'Anna' && t3?.last_name === 'Svensson') {
      pass('first/last name preserved');
    } else {
      fail(`Expected Anna/Svensson, got ${t3?.first_name}/${t3?.last_name}`);
    }

    await supabase.from('contacts').delete().eq('company_id', companyId);

    // ── Test 4: Multi-email + generic name together ────────────────
    console.log('\n── Test 4: Multi-email with generic name "Hr" ──');
    console.log('   Input: fullName="Hr", email="hr@test.se, jobb@test.se"');
    await upsertScrapedContact({
      companyId,
      fullName: 'Hr',
      firstName: 'Hr',
      email: 'hr@test.se, jobb@test.se',
      source: 'test',
      sourceMethod: 'ai_extracted',
    });

    const { data: t4 } = await supabase
      .from('contacts')
      .select('email, full_name, first_name')
      .eq('company_id', companyId)
      .order('email');

    if (t4?.length === 2) {
      pass('2 rows created from multi-email');
    } else {
      fail(`Expected 2 rows, got ${t4?.length}`);
    }
    if (t4?.every((c) => c.full_name === null)) {
      pass('Generic name "Hr" cleared on both rows');
    } else {
      fail(`Names not cleared: ${t4?.map((c) => c.full_name).join(', ')}`);
    }
    if (t4?.every((c) => c.first_name === null)) {
      pass('first_name cleared on both rows');
    } else {
      fail(`first_name not cleared: ${t4?.map((c) => c.first_name).join(', ')}`);
    }

    await supabase.from('contacts').delete().eq('company_id', companyId);

    // ── Test 5: Various generic prefixes ───────────────────────────
    console.log('\n── Test 5: Various generic prefixes ──');
    const genericNames = ['Kontakt', 'Reception', 'Kansli', 'Support', 'Career', 'Rekrytering'];
    for (const name of genericNames) {
      await upsertScrapedContact({
        companyId,
        fullName: name,
        email: `${name.toLowerCase()}@test.se`,
        source: 'test',
        sourceMethod: 'ai_extracted',
      });
    }

    const { data: t5 } = await supabase
      .from('contacts')
      .select('email, full_name')
      .eq('company_id', companyId)
      .order('email');

    if (t5?.length === genericNames.length) {
      pass(`${t5.length} contacts created (emails preserved)`);
    } else {
      fail(`Expected ${genericNames.length} rows, got ${t5?.length}`);
    }
    if (t5?.every((c) => c.full_name === null)) {
      pass(`All ${genericNames.length} generic names cleared to null`);
    } else {
      const kept = t5?.filter((c) => c.full_name !== null).map((c) => c.full_name);
      fail(`Some names not cleared: ${kept?.join(', ')}`);
    }

    // ── Summary ────────────────────────────────────────────────────
    console.log(`\n=== ${failures === 0 ? 'ALL TESTS PASSED' : `${failures} FAILURE(S)`} ===`);
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
