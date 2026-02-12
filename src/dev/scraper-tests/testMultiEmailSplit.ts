// ⚠️ DO NOT MOVE this file — it relies on relative import paths to src/services/ and src/utils/.
/**
 * Integration test: Multi-email split in upsertScrapedContact
 *
 * Tests that a contact with comma-separated emails (e.g. "a@co.se, b@co.se")
 * is correctly split into separate contact rows, each with the same company_id.
 *
 * Requires: .env with SUPABASE_URL, SUPABASE_KEY
 *
 * Run from project root:
 *   pnpm exec tsx src/dev/scraper-tests/testMultiEmailSplit.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../../config/env.js';
import { findOrCreateCompany, upsertScrapedContact } from '../../services/supabaseService.js';

const supabase = createClient(config.supabase.url, config.supabase.key);

const TEST_COMPANY_NAME = '__TEST_MULTI_EMAIL_SPLIT_CO__';
const TEST_DOMAIN = '__test-multi-email-split__.test';
const TEST_EMAILS = ['testemail1@multisplit.test', 'testemail2@multisplit.test'];
const MULTI_EMAIL_STRING = TEST_EMAILS.join(', ');

async function cleanup(companyId: string) {
  // Delete test contacts
  await supabase.from('contacts').delete().eq('company_id', companyId);
  // Delete test company
  await supabase.from('companies').delete().eq('id', companyId);
}

async function run() {
  console.log('=== Multi-Email Split Integration Test ===\n');

  // 1. Create a test company
  console.log('1. Creating test company...');
  const companyId = await findOrCreateCompany(TEST_COMPANY_NAME, TEST_DOMAIN, 'test');
  console.log(`   Company created: ${companyId}\n`);

  try {
    // 2. Call upsertScrapedContact with comma-separated emails
    console.log(`2. Calling upsertScrapedContact with: "${MULTI_EMAIL_STRING}"`);
    const result = await upsertScrapedContact({
      companyId,
      fullName: 'Test Person',
      firstName: 'Test',
      lastName: 'Person',
      email: MULTI_EMAIL_STRING,
      source: 'test_multi_email',
      sourceMethod: 'test',
    });
    console.log(`   Result: ${result ? `id=${result.id}` : 'null'}\n`);

    // 3. Query DB to verify separate rows were created
    console.log('3. Verifying contacts in DB...');
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, email, full_name, company_id')
      .eq('company_id', companyId)
      .order('email');

    if (error) throw error;

    console.log(`   Found ${contacts.length} contact(s):`);
    for (const c of contacts) {
      console.log(`   - email: ${c.email}, full_name: ${c.full_name}, company_id: ${c.company_id}`);
    }

    // 4. Assert results
    console.log('\n4. Assertions:');

    const pass = (msg: string) => console.log(`   ✅ PASS: ${msg}`);
    const fail = (msg: string) => console.log(`   ❌ FAIL: ${msg}`);

    // Should have exactly 2 contacts
    if (contacts.length === 2) {
      pass(`${contacts.length} contact rows created (expected 2)`);
    } else {
      fail(`${contacts.length} contact rows created (expected 2)`);
    }

    // Both should have the same company_id
    const sameCompany = contacts.every((c) => c.company_id === companyId);
    if (sameCompany) {
      pass('Both contacts share the same company_id');
    } else {
      fail('Contacts have different company_ids');
    }

    // Each email should be on its own row
    const emailsFound = contacts.map((c) => c.email).sort();
    const emailsExpected = [...TEST_EMAILS].sort();
    if (JSON.stringify(emailsFound) === JSON.stringify(emailsExpected)) {
      pass(`Emails match: ${emailsFound.join(', ')}`);
    } else {
      fail(`Emails mismatch: got [${emailsFound.join(', ')}], expected [${emailsExpected.join(', ')}]`);
    }

    // No email should contain a comma
    const noCommas = contacts.every((c) => !c.email.includes(','));
    if (noCommas) {
      pass('No comma-separated emails in any row');
    } else {
      fail('Found comma in email field');
    }

    console.log('\n=== Test Complete ===');
  } finally {
    // 5. Clean up test data
    console.log('\n5. Cleaning up test data...');
    await cleanup(companyId);
    console.log('   Done — test company and contacts removed.');
  }
}

run().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
