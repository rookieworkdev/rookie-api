import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Rookie Recruitment API',
      version: '1.0.0',
      description: `
## Overview

The Rookie API serves as the central backend for recruitment data — job scraping, lead generation, AI evaluation, and company intelligence. It aggregates data from multiple scrapers (Indeed, LinkedIn, Arbetsförmedlingen, Google Maps) and runs it through AI scoring pipelines before storing results in Supabase.

These REST endpoints provide the recommended interface for the admin portal. The API handles data aggregation, joins, filtering, and business logic server-side, so the frontend receives clean, ready-to-render responses without needing to understand the underlying table structure, AI scoring internals, or scraper-specific data formats.

This also means that as we add new scrapers, refine scoring models, or restructure the database, **the API contract stays stable** — no frontend changes needed.

---

## Authentication

All protected endpoints require the \`x-api-key\` header:

\`\`\`
x-api-key: <your-api-key>
\`\`\`

Add the API key to your environment:

\`\`\`env
ROOKIE_API_URL=https://rookie-api-production.up.railway.app
ROOKIE_API_KEY=<your-api-key>
\`\`\`

Example fetch helper:

\`\`\`typescript
const API_URL = process.env.ROOKIE_API_URL
const API_KEY = process.env.ROOKIE_API_KEY

async function fetchAPI(path: string, options?: RequestInit) {
  const res = await fetch(\\\`\\\${API_URL}\\\${path}\\\`, {
    ...options,
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  return res.json()
}
\`\`\`

---

## Using Swagger UI

1. Click the **Authorize** button (top right) and paste your API key
2. All subsequent "Try it out" requests will include the \`x-api-key\` header automatically
3. Expand any endpoint, click **Try it out**, adjust parameters, and click **Execute**

**Endpoint types:**
- **Blue (GET)** — Data endpoints for the admin portal: jobs, companies, contacts, signals, dashboard stats.
- **Green (POST)** — Action triggers: run scrapers, send digest emails, cleanup. These are for cron jobs and manual maintenance, not for the portal UI.

---

## Error Responses

All errors follow the same shape:

\`\`\`json
{
  "success": false,
  "error": "Error description",
  "processingTime": 1234
}
\`\`\`

**Common status codes:**

| Code | Meaning |
|------|---------|
| \`401\` | Missing or invalid \`x-api-key\` |
| \`404\` | Resource not found |
| \`429\` | Rate limited (100 requests per 15 minutes) |
| \`500\` | Server error (admin gets an alert email automatically) |
| \`503\` | Scraper disabled (\`SCRAPER_ENABLED=false\`) |

---

## Data Sources

| Source | Type | Description |
|--------|------|-------------|
| Indeed | Job scraper | Via Apify actor |
| LinkedIn | Job scraper | Via Apify actor |
| Arbetsförmedlingen | Job scraper | Direct API (JobTech) |
| Google Maps | Lead scraper | Via Apify actor |
| Website Form | Webhook | AI-classified form submissions |

New scrapers are picked up automatically — stats queries use \`GROUP BY source\`, so no config changes needed.

---

## Base URL

**Production:** \`https://rookie-api-production.up.railway.app\`

**Local development:** \`http://localhost:8000\` — run with \`pnpm dev\`.

The endpoint paths (\`/api/admin/jobs\`, \`/api/docs\`, etc.) stay the same — only the base URL changes. Set the \`ROOKIE_API_URL\` environment variable in your frontend to switch between local and production.
      `,
      contact: {
        name: 'Rookie AB',
      },
    },
    servers: [
      {
        url: 'https://rookie-api-production.up.railway.app',
        description: 'Production (Railway)',
      },
      {
        url: 'http://localhost:8000',
        description: 'Local development',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'API key for protected endpoints. Pass as `x-api-key` header.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Error description' },
            processingTime: { type: 'number', example: 1234 },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: {} },
            total: { type: 'integer', description: 'Total matching records' },
            limit: { type: 'integer', example: 50 },
            offset: { type: 'integer', example: 0 },
          },
        },
        HealthCheck: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        JobSummary: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string', example: 'Ekonomiassistent' },
            source: { type: 'string', example: 'indeed' },
            location: { type: 'string', example: 'Stockholm' },
            ai_valid: { type: 'boolean' },
            ai_score: { type: 'integer', example: 78 },
            ai_category: { type: 'string', example: 'Ekonom' },
            ai_experience: { type: 'string', example: '0-3 years' },
            posted_date: { type: 'string', format: 'date' },
            external_url: { type: 'string', format: 'uri' },
            application_email: { type: 'string', nullable: true },
            salary: { type: 'string', nullable: true },
            duration: { type: 'string', nullable: true },
            published_status: { type: 'string', example: 'scraped' },
            is_ai_generated: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            company_id: { type: 'string', format: 'uuid' },
            companies: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string', example: 'Volvo AB' },
                domain: { type: 'string', example: 'volvo.se' },
              },
            },
          },
        },
        CompanySummary: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Volvo AB' },
            domain: { type: 'string', nullable: true },
            industry: { type: 'string', nullable: true },
            region: { type: 'string', nullable: true },
            current_score: { type: 'integer', example: 75 },
            status: { type: 'string', example: 'backlog' },
            source: { type: 'array', items: { type: 'string' } },
            website: { type: 'string', nullable: true },
            linkedin_url: { type: 'string', nullable: true },
            employee_count: { type: 'integer', nullable: true },
            enrichment_status: { type: 'string', example: 'pending' },
            created_at: { type: 'string', format: 'date-time' },
            job_count: { type: 'integer', example: 5 },
            signal_count: { type: 'integer', example: 8 },
            contact_count: { type: 'integer', example: 3 },
          },
        },
        ContactSummary: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            full_name: { type: 'string', nullable: true },
            email: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            title: { type: 'string', nullable: true },
            linkedin_url: { type: 'string', nullable: true },
            source: { type: 'string', example: 'indeed' },
            source_method: { type: 'string', example: 'ai_extracted', description: 'How the contact was found: api_extracted (from scraper API) or ai_extracted (AI read it from job text)' },
            department: { type: 'string', nullable: true },
            seniority: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            companies: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                domain: { type: 'string', nullable: true },
              },
            },
          },
        },
        SignalSummary: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            signal_type: { type: 'string', example: 'indeed_job_ad' },
            source: { type: 'string', example: 'indeed' },
            signal_date: { type: 'string', format: 'date-time', nullable: true },
            captured_at: { type: 'string', format: 'date-time' },
            expired_at: { type: 'string', format: 'date-time', nullable: true },
            score_contribution: { type: 'integer' },
            payload: { type: 'object', description: 'Signal-specific data (job title, score, URL, etc.)' },
            companies: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                domain: { type: 'string', nullable: true },
              },
            },
          },
        },
        DashboardSummary: {
          type: 'object',
          properties: {
            total_companies: { type: 'integer', example: 280 },
            total_jobs: { type: 'integer', example: 399 },
            total_contacts: { type: 'integer', example: 144 },
            total_signals: { type: 'integer', example: 421 },
            companies_this_week: { type: 'integer', example: 12 },
            jobs_this_week: { type: 'integer', example: 45 },
            signals_this_week: { type: 'integer', example: 67 },
          },
        },
        ScraperRunRequest: {
          type: 'object',
          properties: {
            keywords: { type: 'string', description: 'Comma-separated search keywords', example: 'ekonom,ingenjör' },
            exclusionKeywords: { type: 'array', items: { type: 'string' }, example: ['senior', 'chef'] },
            country: { type: 'string', default: 'SE' },
            maxItems: { type: 'integer', default: 50 },
          },
        },
        ScraperRunResult: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            runId: { type: 'string', format: 'uuid' },
            processingTime: { type: 'number', example: 45000 },
            stats: {
              type: 'object',
              properties: {
                fetched: { type: 'integer' },
                afterDedup: { type: 'integer' },
                afterFilter: { type: 'integer' },
                processed: { type: 'integer' },
                valid: { type: 'integer' },
                discarded: { type: 'integer' },
                errors: { type: 'integer' },
              },
            },
            summary: {
              type: 'object',
              properties: {
                newJobsFound: { type: 'integer' },
                validJobs: { type: 'integer' },
                discardedJobs: { type: 'integer' },
                errors: { type: 'integer' },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Health', description: 'Health check endpoints (public, no auth required)' },
      { name: 'Dashboard', description: 'Dashboard summary and overview data' },
      { name: 'Jobs', description: 'Browse and filter scraped job postings with AI evaluations' },
      { name: 'Companies', description: 'Browse companies with aggregated signal, contact, and job counts' },
      { name: 'Contacts', description: 'Browse extracted contacts from scrapers and form submissions' },
      { name: 'Signals', description: 'Browse recruitment signals (job postings, form submissions, map listings)' },
      { name: 'Stats', description: 'Aggregated statistics and health check data' },
      { name: 'Scrapers', description: 'Trigger scraper runs (typically called by cron jobs)' },
      { name: 'Webhook', description: 'Form submission webhook (called by the Rookie website)' },
    ],
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
