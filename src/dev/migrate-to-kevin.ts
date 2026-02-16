/**
 * One-time migration script: Copy data from Rookie 2.0 DB → Kevin's DB
 *
 * Copies: companies, contacts, jobs, scraping_signals, scraping_rejected_leads,
 *         website_rookies, website_inspiration
 *
 * Does NOT delete anything from Kevin's DB — only inserts.
 * Skips rows that already exist (ON CONFLICT DO NOTHING where possible).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Source: Rookie 2.0
const SOURCE_URL = process.env.SOURCE_SUPABASE_URL || 'https://ydsjrhnrsnfefhuefgul.supabase.co';
const SOURCE_KEY = process.env.SOURCE_SUPABASE_KEY!;

// Target: Kevin's DB
const TARGET_URL = process.env.TARGET_SUPABASE_URL || 'https://nfbgfavsjqszhchooapa.supabase.co';
const TARGET_KEY = process.env.TARGET_SUPABASE_KEY!;

if (!SOURCE_KEY || !TARGET_KEY) {
  console.error('Set SOURCE_SUPABASE_KEY and TARGET_SUPABASE_KEY environment variables');
  process.exit(1);
}

const source = createClient(SOURCE_URL, SOURCE_KEY);
const target = createClient(TARGET_URL, TARGET_KEY);

const BATCH_SIZE = 50;

async function fetchAll(client: SupabaseClient, table: string, orderBy = 'created_at') {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .order(orderBy, { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    offset += BATCH_SIZE;
    if (data.length < BATCH_SIZE) break;
  }
  return rows;
}

async function insertBatch(client: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return 0;

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await client
      .from(table)
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });

    if (error) {
      console.error(`  Error inserting batch into ${table} (offset ${i}):`, error.message);
      // Try one by one for this batch
      for (const row of batch) {
        const { error: singleError } = await client
          .from(table)
          .upsert(row, { onConflict: 'id', ignoreDuplicates: true });
        if (singleError) {
          console.error(`  Failed single row in ${table}:`, singleError.message, row);
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
    }
  }
  return inserted;
}

async function migrateTable(table: string, orderBy = 'created_at') {
  console.log(`\n--- Migrating: ${table} ---`);

  const rows = await fetchAll(source, table, orderBy);
  console.log(`  Fetched ${rows.length} rows from source`);

  if (rows.length === 0) {
    console.log('  Nothing to migrate');
    return;
  }

  const inserted = await insertBatch(target, table, rows);
  console.log(`  Inserted ${inserted} rows into target`);
}

async function main() {
  console.log('=== Migration: Rookie 2.0 → Kevin\'s DB ===\n');

  // Verify connections
  const { count: sourceCount } = await source.from('companies').select('*', { count: 'exact', head: true });
  const { count: targetCount } = await target.from('companies').select('*', { count: 'exact', head: true });
  console.log(`Source companies: ${sourceCount}`);
  console.log(`Target companies: ${targetCount}`);

  // Migrate in FK order
  await migrateTable('companies');
  await migrateTable('contacts');
  await migrateTable('jobs');
  await migrateTable('scraping_signals', 'captured_at');
  await migrateTable('scraping_rejected_leads');
  await migrateTable('website_rookies');
  await migrateTable('website_inspiration');

  // Final counts
  console.log('\n=== Final target counts ===');
  for (const table of ['companies', 'contacts', 'jobs', 'scraping_signals', 'scraping_rejected_leads', 'website_rookies', 'website_inspiration']) {
    const { count } = await target.from(table).select('*', { count: 'exact', head: true });
    console.log(`  ${table}: ${count}`);
  }

  console.log('\n=== Migration complete ===');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
