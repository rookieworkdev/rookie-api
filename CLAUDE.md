# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

TypeScript Express API for Rookie AB recruitment agency. Currently implements two workflows (form lead processing + Indeed job scraping), but this is **early stage** with plans to expand significantly:

- **More scrapers**: LinkedIn, Arbetsförmedlingen, Google Maps leads
- **Outreach integrations**: Evaluating Rule.io, Resend, Juicebox, HeyReach, Expandi
- **Custom + 3rd party solutions** for lead generation and outreach automation

### Current Workflows

1. **Lead Processing Webhook** (`/api/webhook`) - AI-powered form submission classification
2. **Job Scraper Pipeline** (`/api/scraping/jobs/indeed`) - Indeed scraper with AI evaluation

Converted from N8n workflows with equivalent logic preserved.

## Database Architecture

**CRITICAL**: Working against two Supabase databases:

- **Rookie 2.0** (active development, this codebase)
- **rookie-platform-database** (colleague's parallel work)

**Table names must remain identical** between databases. Current sync issues tracked in `TASKS.md`. Upcoming renames:

- `job_ads` → `jobs`
- `job_ads_stats` → `job_stats`
- Remove `company_description` column (use `description` only)

See `TASKS.md` for full database change checklist.

## Common Commands

```bash
pnpm install            # Install dependencies
pnpm dev                # Start with hot-reload (tsx watch)
pnpm build              # Compile TypeScript to dist/
pnpm start              # Run compiled JavaScript
pnpm typecheck          # Type-check without emitting
pnpm test               # Node.js native test runner
```

Environment: Copy `.env.example` to `.env`. Required: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `RESEND_API_KEY`

## Architecture Overview

### Workflow Details

See `src/routes/webhook.ts` and `src/routes/jobScraping.ts` for complete flows.

**Webhook**: Zod validation → fast spam check → OpenAI classification (4 categories) → company/contact/signal creation → AI job ad → email
**Scraper**: Apify fetch → dedup → AI evaluation → company/job/signal/contact creation → digest email → GitHub Actions cron

### Service Layers

- `aiService.ts` - OpenAI/OpenRouter calls (lead scoring, job ad generation, job evaluation with fallback)
- `supabaseService.ts` - All DB operations via `find_or_create_company()` stored procedure + direct inserts
- `emailService.ts` - Resend integration (lead emails, admin alerts, scraper digests)

### Key Data Flows

**Company deduplication**: Email domain extraction → stored procedure matches by domain or name
**Signals**: Track recruitment intent per company (separate types for inquiries vs job postings)
**Contact extraction**: Form submission (webhook) or AI-extracted email (scraper)
**Job ads**: `is_ai_generated` + `published_status` differentiate webhook vs scraped jobs

### Technical Stack

- **ES Modules** (`NodeNext` resolution) - all imports need `.js` extension even for `.ts` files
- **Strict TypeScript** - compiles to `dist/` with source maps
- **Middleware**: Helmet → CORS → Rate limiting (100/15min) → Raw body capture → Logging
- **Error handling**: Webhook always returns 200 (saves to DB + alerts admin), Scraper returns 500

## Integrations & Tools

### Supabase Database

- Stored procedure: `find_or_create_company(p_name, p_domain, p_source)` - see README.md for full schema
- Use **Supabase MCP** for all DB operations (available via MCP tools)

### AI Models

- Lead classification: `gpt-4o-mini`
- Job evaluation: `gpt-4o` (OpenRouter) with `gpt-4o-mini` fallback
- Prompts in `src/prompts/` and embedded in `aiService.ts`

### Available MCP Servers

- **supabase** - Database operations (migrations, queries, advisors)
- **context7** - Up-to-date library documentation lookup
- **n8n-mcp** - N8n workflow management (original source workflows)
- **firecrawl-mcp** - Web scraping capabilities (future lead gen)
- See system reminder for full list

### Skills

Located in `.claude/skills/`:

- `context7-docs-lookup` - Library documentation fetching
- `nodejs-backend-patterns` - Backend architecture patterns

Suggest additional skills as needed (pre-existing, plugins, or custom).

### GitHub Actions

- Daily scraper (6 AM UTC) + weekly cleanup (Sunday midnight)
- See `.github/workflows/job-scraper-cron.yml`

## Critical Business Logic

### Lead Classification (from `SCORING_SYSTEM_PROMPT` in `aiService.ts`)

- **ROLE > INDUSTRY** - white-collar roles valid even in non-ideal industries
- Valid: ekonom, ingenjör, tekniker, kundtjänst, analytiker (0-8 years exp)
- Invalid: healthcare, teachers, manual labor (unless admin roles)
- Personal emails (gmail, hotmail) → invalid unless clear company context
- Job seekers → `likely_candidate`

### Job Evaluation (from `src/prompts/jobEvaluation.prompt.ts`)

- Target: 0-8 years experience, entry to mid-career
- Categories: Ekonom, Ingenjör, Tekniker, Kundtjänst, Administratör
- Invalid: senior (8+), managerial, healthcare, teaching, manual labor

## Important Notes

### Common Gotchas

1. **Import extensions**: Always `.js` even for `.ts` files (ES modules)
2. **PII logging**: Use `maskEmail()` / `maskPiiForLogging()` before logging
3. **Database sync**: Table names must match `rookie-platform-database` - check `TASKS.md` before renames
4. **Supabase key**: Service role key, not anon key
5. **Contact upserts**: Unique on `(company_id, email)`
6. **Job dedup**: Checks both `externalId` and `url` fields

### Testing

Node.js native test runner (`pnpm test`), files in `tests/*.test.js`, set `NODE_ENV=test`

### Deployment

Health checks: `/api/health`, `/api/scraping/jobs/health`
Graceful shutdown: 10s timeout on SIGTERM/SIGINT
Docker-ready (see README)
