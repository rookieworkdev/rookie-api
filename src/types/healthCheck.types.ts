export type HealthCheckSeverity = 'ok' | 'warning' | 'critical';
export type HealthCheckCategory =
  | 'referential_integrity'
  | 'data_quality'
  | 'freshness'
  | 'signal_stats'
  | 'volume';

export interface HealthCheckItem {
  id: string;
  name: string;
  category: HealthCheckCategory;
  severity: HealthCheckSeverity;
  message: string;
  count: number;
  details?: Record<string, unknown>[];
  threshold?: { warning: number; critical: number };
}

export interface HealthCheckResult {
  timestamp: string;
  duration: number;
  overallSeverity: HealthCheckSeverity;
  summary: { total: number; ok: number; warning: number; critical: number };
  checks: HealthCheckItem[];
  signalsBySource: SignalsBySource[];
  topCompanies: TopCompanyBySignals[];
  jobsBySource: JobsBySource[];
}

export interface SignalsBySource {
  source: string;
  total: number;
  last_7_days: number;
  last_30_days: number;
  last_captured: string | null;
}

export interface TopCompanyBySignals {
  company_id: string;
  company_name: string;
  domain: string | null;
  signal_count: number;
  last_signal: string | null;
}

export interface JobsBySource {
  source: string;
  total: number;
  last_7_days: number;
  last_30_days: number;
  valid: number;
  discarded: number;
}
