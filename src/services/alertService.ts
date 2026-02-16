import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type {
  SystemAlertSource,
  SystemAlertStage,
  SystemAlertSeverity,
} from '../types/index.js';

const supabase = createClient(config.supabase.url, config.supabase.key!);

export interface EmitAlertParams {
  source: SystemAlertSource;
  stage: SystemAlertStage;
  severity: SystemAlertSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  relatedJobId?: string;
  relatedCompanyId?: string;
}

/**
 * Fire-and-forget alert emitter. Inserts a row into system_alerts.
 *
 * - NEVER throws
 * - NEVER blocks the caller
 * - PII in metadata must be pre-masked by the caller
 */
export function emitAlert(params: EmitAlertParams): void {
  _insertAlert(params).catch((err) => {
    logger.error('Failed to emit system alert', err, {
      alertSource: params.source,
      alertStage: params.stage,
      alertTitle: params.title,
    });
  });
}

async function _insertAlert(params: EmitAlertParams): Promise<void> {
  const { error } = await supabase.from('system_alerts').insert({
    source: params.source,
    stage: params.stage,
    severity: params.severity,
    title: params.title,
    message: params.message,
    metadata: params.metadata ?? {},
    related_job_id: params.relatedJobId ?? null,
    related_company_id: params.relatedCompanyId ?? null,
  });

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }
}
