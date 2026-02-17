import dotenv from 'dotenv';
import type { Config } from '../types/index.js';

dotenv.config();

export const config: Config = {
  port: process.env.PORT || 8000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
    temperature: 0.7,
  },

  // OpenRouter (for job evaluation with model fallback)
  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    primaryModel: 'openai/gpt-4o',
    fallbackModel: 'openai/gpt-4o-mini',
  },

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL!,
    key: process.env.SUPABASE_KEY,
  },

  // Resend (for email)
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
  },

  // Admin alerts
  adminAlert: {
    email: process.env.ADMIN_ALERT_EMAIL,
  },

  // Webhook security
  webhook: {
    secret: process.env.WEBHOOK_SECRET,
  },

  // Apify (for scrapers)
  apify: {
    apiKey: process.env.APIFY_API_KEY,
  },

  // Job scraper settings
  scraper: {
    apiKey: process.env.SCRAPER_API_KEY,
    enabled: process.env.SCRAPER_ENABLED !== 'false',
    keywords: process.env.SCRAPER_KEYWORDS || '',
    exclusionKeywords: process.env.SCRAPER_EXCLUSION_KEYWORDS?.split(',').map((k) => k.trim()) || [],
    country: process.env.SCRAPER_COUNTRY || 'SE',
    maxItems: parseInt(process.env.SCRAPER_MAX_ITEMS || '50', 10),
    retentionDays: parseInt(process.env.JOB_RETENTION_DAYS || '20', 10),
  },
};

// Validation
const requiredEnvVars = ['OPENROUTER_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY', 'RESEND_API_KEY'];
const missing = requiredEnvVars.filter((key) => !process.env[key]);

if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
