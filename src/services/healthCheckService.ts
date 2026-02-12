import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { logger, getErrorMessage } from '../utils/logger.js';
import type {
  HealthCheckItem,
  HealthCheckResult,
  HealthCheckSeverity,
  SignalsBySource,
  TopCompanyBySignals,
  JobsBySource,
} from '../types/healthCheck.types.js';

const supabase = createClient(config.supabase.url, config.supabase.key!);

// ============================================================================
// THRESHOLD CONSTANTS
// ============================================================================

const THRESHOLDS = {
  orphaned_jobs: { warning: 7, critical: 20 },
  orphaned_signals: { warning: 1, critical: 10 },
  orphaned_contacts: { warning: 1, critical: 10 },
  broken_signal_job_refs: { warning: 1, critical: 10 },
  duplicate_companies: { warning: 3, critical: 10 },
  duplicate_contacts: { warning: 1, critical: 5 },
  generic_name_contacts: { warning: 5, critical: 20 },
  comma_email_contacts: { warning: 1, critical: 5 },
  zombie_companies: { warning: 20, critical: 50 },
  fake_slug_domains: { warning: 3, critical: 10 },
  stale_scrapers: { warning: 1, critical: 2 },
  expired_signal_ratio: { warning: 50, critical: 80 },
} as const;

function severityFromCount(
  count: number,
  threshold: { warning: number; critical: number }
): HealthCheckSeverity {
  if (count >= threshold.critical) return 'critical';
  if (count >= threshold.warning) return 'warning';
  return 'ok';
}

// ============================================================================
// CATEGORY RUNNERS
// ============================================================================

async function runReferentialIntegrity(): Promise<HealthCheckItem[]> {
  const { data, error } = await supabase.rpc('health_check_referential_integrity');
  if (error) throw new Error(`referential_integrity RPC failed: ${getErrorMessage(error)}`);

  const d = data as Record<string, number>;
  const checks: { id: string; name: string; key: keyof typeof THRESHOLDS }[] = [
    { id: 'orphaned_jobs', name: 'Orphaned Jobs', key: 'orphaned_jobs' },
    { id: 'orphaned_signals', name: 'Orphaned Signals', key: 'orphaned_signals' },
    { id: 'orphaned_contacts', name: 'Orphaned Contacts', key: 'orphaned_contacts' },
    { id: 'broken_signal_job_refs', name: 'Broken Signal→Job Refs', key: 'broken_signal_job_refs' },
  ];

  return checks.map(({ id, name, key }) => {
    const count = d[id] ?? 0;
    const threshold = THRESHOLDS[key];
    const severity = severityFromCount(count, threshold);
    return {
      id,
      name,
      category: 'referential_integrity' as const,
      severity,
      message: count === 0 ? 'No issues found' : `${count} ${name.toLowerCase()} detected`,
      count,
      threshold,
    };
  });
}

async function runDataQuality(): Promise<HealthCheckItem[]> {
  const { data, error } = await supabase.rpc('health_check_data_quality');
  if (error) throw new Error(`data_quality RPC failed: ${getErrorMessage(error)}`);

  const d = data as Record<string, number>;
  const checks: { id: string; name: string; key: keyof typeof THRESHOLDS }[] = [
    { id: 'duplicate_companies', name: 'Duplicate Companies', key: 'duplicate_companies' },
    { id: 'duplicate_contacts', name: 'Duplicate Contacts', key: 'duplicate_contacts' },
    { id: 'generic_name_contacts', name: 'Generic Name Contacts', key: 'generic_name_contacts' },
    { id: 'comma_email_contacts', name: 'Comma-Separated Emails', key: 'comma_email_contacts' },
    { id: 'zombie_companies', name: 'Zombie Companies (No Signals)', key: 'zombie_companies' },
    { id: 'fake_slug_domains', name: 'Fake Slug Domains', key: 'fake_slug_domains' },
  ];

  return checks.map(({ id, name, key }) => {
    const count = d[id] ?? 0;
    const threshold = THRESHOLDS[key];
    const severity = severityFromCount(count, threshold);
    return {
      id,
      name,
      category: 'data_quality' as const,
      severity,
      message: count === 0 ? 'No issues found' : `${count} ${name.toLowerCase()} detected`,
      count,
      threshold,
    };
  });
}

async function runFreshness(): Promise<HealthCheckItem[]> {
  const { data, error } = await supabase.rpc('health_check_freshness');
  if (error) throw new Error(`freshness RPC failed: ${getErrorMessage(error)}`);

  const d = data as {
    stale_scrapers: Record<string, unknown>[];
    signal_expiry: { total: number; expired: number; active: number };
    table_freshness: Record<string, string | null>;
  };

  const items: HealthCheckItem[] = [];

  // Stale scrapers
  const staleCount = d.stale_scrapers.length;
  const staleThreshold = THRESHOLDS.stale_scrapers;
  items.push({
    id: 'stale_scrapers',
    name: 'Stale Scrapers',
    category: 'freshness',
    severity: severityFromCount(staleCount, staleThreshold),
    message:
      staleCount === 0
        ? 'All scrapers active within 3 days'
        : `${staleCount} scraper source(s) stale for 3+ days`,
    count: staleCount,
    details: d.stale_scrapers as Record<string, unknown>[],
    threshold: staleThreshold,
  });

  // Expired signal ratio
  const total = d.signal_expiry.total || 1;
  const expiredPct = Math.round((d.signal_expiry.expired / total) * 100);
  const expiryThreshold = THRESHOLDS.expired_signal_ratio;
  items.push({
    id: 'expired_signal_ratio',
    name: 'Expired Signal Ratio',
    category: 'freshness',
    severity: severityFromCount(expiredPct, expiryThreshold),
    message: `${expiredPct}% of signals expired (${d.signal_expiry.expired}/${d.signal_expiry.total})`,
    count: expiredPct,
    details: [d.signal_expiry as unknown as Record<string, unknown>],
    threshold: expiryThreshold,
  });

  // Table freshness (informational, always OK)
  items.push({
    id: 'table_freshness',
    name: 'Table Freshness',
    category: 'freshness',
    severity: 'ok',
    message: 'Most recent record timestamps per table',
    count: 0,
    details: [d.table_freshness as unknown as Record<string, unknown>],
  });

  return items;
}

async function runSignalStats(): Promise<{
  items: HealthCheckItem[];
  signalsBySource: SignalsBySource[];
  topCompanies: TopCompanyBySignals[];
}> {
  const { data, error } = await supabase.rpc('health_check_signal_stats');
  if (error) throw new Error(`signal_stats RPC failed: ${getErrorMessage(error)}`);

  const d = data as {
    by_source: SignalsBySource[];
    by_type: Record<string, unknown>[];
    top_companies: TopCompanyBySignals[];
  };

  const items: HealthCheckItem[] = [
    {
      id: 'signals_by_source',
      name: 'Signals by Source',
      category: 'signal_stats',
      severity: 'ok',
      message: `${d.by_source.length} active signal sources`,
      count: d.by_source.length,
      details: d.by_source as unknown as Record<string, unknown>[],
    },
    {
      id: 'signal_type_distribution',
      name: 'Signal Type Distribution',
      category: 'signal_stats',
      severity: 'ok',
      message: `${d.by_type.length} signal type/source combinations`,
      count: d.by_type.length,
      details: d.by_type,
    },
    {
      id: 'top_companies_by_signals',
      name: 'Top Companies by Signals',
      category: 'signal_stats',
      severity: 'ok',
      message: `Top ${d.top_companies.length} companies by signal count`,
      count: d.top_companies.length,
      details: d.top_companies as unknown as Record<string, unknown>[],
    },
  ];

  return {
    items,
    signalsBySource: d.by_source,
    topCompanies: d.top_companies,
  };
}

async function runVolume(): Promise<{
  items: HealthCheckItem[];
  jobsBySource: JobsBySource[];
}> {
  const { data, error } = await supabase.rpc('health_check_volume');
  if (error) throw new Error(`volume RPC failed: ${getErrorMessage(error)}`);

  const d = data as {
    row_counts: Record<string, number>;
    null_rates: Record<string, number>;
    jobs_by_source: JobsBySource[];
  };

  const totalRows = Object.values(d.row_counts).reduce((a, b) => a + b, 0);

  const items: HealthCheckItem[] = [
    {
      id: 'row_counts',
      name: 'Row Counts',
      category: 'volume',
      severity: 'ok',
      message: `${totalRows} total rows across ${Object.keys(d.row_counts).length} tables`,
      count: totalRows,
      details: [d.row_counts as unknown as Record<string, unknown>],
    },
    {
      id: 'null_rates',
      name: 'Null Rate Columns',
      category: 'volume',
      severity: 'ok',
      message: 'Null counts for key columns',
      count: 0,
      details: [d.null_rates as unknown as Record<string, unknown>],
    },
    {
      id: 'jobs_by_source',
      name: 'Jobs by Source',
      category: 'volume',
      severity: 'ok',
      message: `${d.jobs_by_source.length} job sources tracked`,
      count: d.jobs_by_source.length,
      details: d.jobs_by_source as unknown as Record<string, unknown>[],
    },
  ];

  return { items, jobsBySource: d.jobs_by_source };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Run all 5 health check categories and return a unified result.
 * Uses Promise.allSettled so partial failures don't block other categories.
 */
export async function runFullHealthCheck(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  logger.info('Starting full health check');

  const [refResult, dqResult, freshResult, signalResult, volResult] =
    await Promise.allSettled([
      runReferentialIntegrity(),
      runDataQuality(),
      runFreshness(),
      runSignalStats(),
      runVolume(),
    ]);

  const checks: HealthCheckItem[] = [];
  let signalsBySource: SignalsBySource[] = [];
  let topCompanies: TopCompanyBySignals[] = [];
  let jobsBySource: JobsBySource[] = [];

  // Collect results, log failures
  if (refResult.status === 'fulfilled') {
    checks.push(...refResult.value);
  } else {
    logger.error('Referential integrity check failed', refResult.reason);
  }

  if (dqResult.status === 'fulfilled') {
    checks.push(...dqResult.value);
  } else {
    logger.error('Data quality check failed', dqResult.reason);
  }

  if (freshResult.status === 'fulfilled') {
    checks.push(...freshResult.value);
  } else {
    logger.error('Freshness check failed', freshResult.reason);
  }

  if (signalResult.status === 'fulfilled') {
    checks.push(...signalResult.value.items);
    signalsBySource = signalResult.value.signalsBySource;
    topCompanies = signalResult.value.topCompanies;
  } else {
    logger.error('Signal stats check failed', signalResult.reason);
  }

  if (volResult.status === 'fulfilled') {
    checks.push(...volResult.value.items);
    jobsBySource = volResult.value.jobsBySource;
  } else {
    logger.error('Volume check failed', volResult.reason);
  }

  // Compute overall severity
  const severityOrder: HealthCheckSeverity[] = ['ok', 'warning', 'critical'];
  const overallSeverity = checks.reduce<HealthCheckSeverity>((worst, check) => {
    return severityOrder.indexOf(check.severity) > severityOrder.indexOf(worst)
      ? check.severity
      : worst;
  }, 'ok');

  const summary = {
    total: checks.length,
    ok: checks.filter((c) => c.severity === 'ok').length,
    warning: checks.filter((c) => c.severity === 'warning').length,
    critical: checks.filter((c) => c.severity === 'critical').length,
  };

  const duration = Date.now() - startTime;

  logger.info('Health check complete', { duration, overallSeverity, summary });

  return {
    timestamp: new Date().toISOString(),
    duration,
    overallSeverity,
    summary,
    checks,
    signalsBySource,
    topCompanies,
    jobsBySource,
  };
}

/**
 * Get signal stats by source (standalone endpoint)
 */
export async function getSignalsBySource(): Promise<SignalsBySource[]> {
  const { data, error } = await supabase.rpc('health_check_signal_stats');
  if (error) throw new Error(`signal_stats RPC failed: ${getErrorMessage(error)}`);
  return (data as { by_source: SignalsBySource[] }).by_source;
}

/**
 * Get top companies by signal count (standalone endpoint)
 */
export async function getTopCompanies(): Promise<TopCompanyBySignals[]> {
  const { data, error } = await supabase.rpc('health_check_signal_stats');
  if (error) throw new Error(`signal_stats RPC failed: ${getErrorMessage(error)}`);
  return (data as { top_companies: TopCompanyBySignals[] }).top_companies;
}

/**
 * Get jobs by source (standalone endpoint)
 */
export async function getJobsBySource(): Promise<JobsBySource[]> {
  const { data, error } = await supabase.rpc('health_check_volume');
  if (error) throw new Error(`volume RPC failed: ${getErrorMessage(error)}`);
  return (data as { jobs_by_source: JobsBySource[] }).jobs_by_source;
}
