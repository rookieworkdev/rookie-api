import dotenv from 'dotenv';
import type { Config } from '../types/index.js';

dotenv.config();

export const config: Config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
    temperature: 0.7,
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
};

// Validation
const requiredEnvVars = ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY', 'RESEND_API_KEY'];
const missing = requiredEnvVars.filter((key) => !process.env[key]);

if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
