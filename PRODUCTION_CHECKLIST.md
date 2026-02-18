# Production Deployment Checklist

## Project Overview

**What This Is:**
TypeScript Express API for Rookie AB recruitment agency. Handles form submissions (AI lead classification), job scraping (Indeed, LinkedIn, AF), lead scraping (Google Maps), admin data endpoints, and API documentation (Swagger UI).

**Current Status:**
- API deployed on Railway: `https://rookie-api-production.up.railway.app`
- Swagger docs: `https://rookie-api-production.up.railway.app/api/docs`
- Webhook: `https://rookie-api-production.up.railway.app/api/webhook`
- Website: `https://rookie-2-0.vercel.app/` (webhook URL pointing to Railway) — **note: will likely be deprecated in favor of the rookie-platform client form**
- Database: Kevin's `rookie-platform-database` (`nfbgfavsjqszhchooapa`)
- GitHub: `rookieworkdev/rookie-api` (auto-deploys to Railway on push to main)
- Railway dashboard: `https://railway.com/project/1151a664-6531-4e21-b3fe-9c4336943ed3`

**Old Vercel projects** (`rookie-api`, `rookie-lead-qualification-form`) are superseded — safe to delete.

---

## Railway Deployment Guide

### Why Railway

- **~$5/mo** — Hobby plan with $5 included credit covers the API + cron jobs
- **Most Vercel-like experience** — git push deploys, auto-framework detection, PR previews
- **No Dockerfile needed** — Nixpacks auto-detects pnpm + TypeScript
- **Native cron support** — configure schedules in the dashboard
- **Free trial** — $5 credit, 30 days, no credit card required

### Codebase compatibility

The codebase is already Railway-compatible:

- **Port**: `process.env.PORT || 8000` — Railway sets `PORT` automatically
- **Build**: `pnpm build` (tsc) — Railway's Nixpacks detects pnpm natively
- **Start**: `node dist/index.js` — standard, works perfectly
- **Graceful shutdown**: Handles `SIGTERM` already — Railway sends exactly that
- **Env vars**: All externalized via `process.env`, nothing hardcoded
- **Vercel guard**: `process.env.VERCEL !== '1'` won't trigger on Railway, so the server starts normally
- **`dist/` gitignored**: Railway builds from source, which is correct
- **`engines` field**: `package.json` specifies `node >= 20` so Railway uses the right runtime

### Setup steps

**1. Sign up & connect repo** — DONE
**2. Railway auto-detects everything** — DONE
**3. Add environment variables** — DONE (18 vars set via Railway MCP)
**4. Generate a public URL** — DONE
**5. Set up cron jobs** — DONE (via `node-cron` in `src/cron.ts`)
**6. Push & deploy** — DONE

---

## Pre-Deployment: Environment Variables

### 1. Configure environment variables on Railway — DONE

All 18 variables set. `PORT` injected automatically by Railway. Pointing to Kevin's DB (`nfbgfavsjqszhchooapa`).

### 2. Update webhook URL in website project — DONE

- Website Vercel project `WEBHOOK_URL` updated to `https://rookie-api-production.up.railway.app/api/webhook`
- Redeployed and tested with live form submission — end-to-end pipeline verified

---

## Pre-Deployment: Email

### 3. Email strategy — Rule.io for outreach, Resend for internal

**Decision (2026-02-18):** All lead-facing and outreach emails will go through **Rule.io**. Resend stays for internal/system emails only (admin alerts, scraper digests, health digests).

**Current state:**
- Resend sends internal emails to `rookiework.dev@gmail.com` (admin alerts, scraper digests, health digests) — this works and stays as-is
- No lead-facing emails are sent yet — these will go through Rule.io when integrated

**Resend domain verification:** Not needed for MVP since lead-facing emails go through Rule.io. Can revisit later if we need Resend for anything beyond internal emails.

**AI Job Ad email:** The AI-generated job ad email was tied to the old webhook form flow. With the shift to Rule.io and the rookie-platform client form, the email routing decision is deferred — it will be handled as part of the Rule.io outreach flow.

### 4. Email templates — leave as-is

Internal email templates (scraper digest, health digest, admin alerts) are functional. No changes needed before go-live since lead-facing emails move to Rule.io.

---

## Pre-Deployment: Scraper Tuning

**IMPORTANT: These settings are currently configured for testing with low limits. Before going live, manually review and adjust all of these with Håkan at Rookie. See TASKS.md → "Scraper Tuning with Håkan" for the full task list.**

### 5. Keywords, categories, and prompts — MUST REVIEW WITH HÅKAN

Settings to manually adjust in config files before production:

- [ ] **Keywords per scraper** — currently broad starting points. Files: `src/config/indeed.config.ts`, `src/config/linkedin.config.ts`, `src/config/af.config.ts`, `src/config/googleMaps.config.ts`. Ask Håkan which roles and categories Rookie actually targets.
- [ ] **Exclusion keywords** — are we filtering out roles we shouldn't? Missing exclusions?
- [ ] **AI evaluation prompts** — `src/prompts/jobEvaluation.prompt.ts` and system prompts in `src/services/aiService.ts`. Are the scoring criteria and valid/invalid role definitions correct?
- [ ] **maxItems per scraper** — currently very low for testing. Adjust for production volumes:

  | Scraper | Current maxItems | Suggested production | Config file |
  |---------|-----------------|---------------------|-------------|
  | Indeed | 50 | 200-300 | `src/config/indeed.config.ts` |
  | LinkedIn | 10/category | 100-200/category | `src/config/linkedin.config.ts` |
  | AF | 100 | 500-1000 | `src/config/af.config.ts` |
  | Google Maps | 50/query | 100-200/query | `src/config/googleMaps.config.ts` |

- [ ] **Cron frequency** — review if daily is right for job scrapers, weekly for Google Maps
- [ ] **`published-after` window** — AF: 15 days, LinkedIn: 24h — review if appropriate
- [ ] **Categories/search queries** — especially Google Maps production query list (~40 queries in config file, only 3 active for testing)

**Note:** Long-term, these will be admin-configurable from Kevin's portal (see TASKS.md → "Admin-Configurable Scraper Settings"). For now, all changes are manual in config files.

### 6. Cron job schedule — DONE

Implemented using `node-cron` inside the Express app (`src/cron.ts`). First automated run verified 2026-02-18.

| Job | Cron expression | Time (UTC) | Endpoint |
|-----|----------------|------------|----------|
| Indeed scraper | `0 6 * * *` | Daily 06:00 | `POST /api/scraping/jobs/indeed` |
| LinkedIn scraper | `0 7 * * *` | Daily 07:00 | `POST /api/scraping/jobs/linkedin` |
| AF scraper | `0 8 * * *` | Daily 08:00 | `POST /api/scraping/jobs/af` |
| Google Maps | `0 10 * * 0` | Sunday 10:00 | `POST /api/scraping/leads/google-maps` |
| Job cleanup | `0 0 * * 0` | Sunday 00:00 | `POST /api/scraping/jobs/cleanup` |
| Health digest | `0 8 * * 1` | Monday 08:00 | `POST /api/admin/health-check/send-digest` |

### 7. Google Maps scraper strategy

The Google Maps Apify actor does a full geographic scan (500 cities, 16,000+ segments) regardless of `maxItems`. This means:
- Even `maxItems: 4` takes ~10-12 min per query
- It's designed for one-time or infrequent bulk scrapes, not daily runs
- **Strategy:** Run one large initial scrape to populate leads, then schedule refreshes every few months (or manually trigger when expanding to new areas/industries)
- **Future:** Investigate city-specific searches, smaller radius, or different Apify actors for faster incremental runs

---

## Pre-Deployment: Security & CORS

### 8. CORS settings — DONE

`ALLOWED_ORIGINS=https://rookie-2-0.vercel.app,https://rookie-api-production.up.railway.app`
Add `https://rookiework.se` when the website gets a custom domain.

### 9. Webhook signature verification — DONE

Verified by successful live form submission test (2026-02-17). HMAC signatures match.

### 10. API key for admin/scraper endpoints — DONE

- [x] `SCRAPER_API_KEY` set on Railway
- [x] Kevin already has the API key
- [x] Swagger docs: `https://rookie-api-production.up.railway.app/api/docs`

---

## Pre-Deployment: Testing

### 11. Smoke tests after deployment — MOSTLY DONE

- [x] Health check: `GET /api/health` → `{ status: "healthy" }`
- [x] Swagger UI loads: `GET /api/docs` → interactive docs with production URL
- [x] Admin dashboard: `GET /api/admin/dashboard` → 362 companies, 521 jobs, 195 contacts, 540 signals
- [x] Webhook end-to-end: form submission → company + signal + contact + AI job ad all in DB, zero system alerts
- [x] Cron scrapers: first automated run verified (2026-02-18)
- [ ] Scraper: manually trigger a scraper via Swagger and verify results in Supabase

### 12. Test cases for webhook

1. **Valid lead**: Company email, good description → email sent, check `companies`, `signals`, `contacts`, `jobs` tables
2. **Spam**: Obvious spam content → fast reject, check `rejected_leads` table
3. **Candidate**: Personal email, job-seeking language → check `candidate_leads` table
4. **Error handling**: Temporarily set invalid OpenRouter key → form data saved to `rejected_leads` with `classification = 'processing_error'`, admin alert email sent

---

## Pre-Deployment: Code Quality

### 13. Run code review

- [ ] Run the `/code-review` skill (`.claude/skills/code-review/`) for a full automated review
- [ ] Review against personal coding checklist (`~/Desktop/Checklist for coding projects.md`)
- [ ] Check for any TODO/FIXME/HACK comments that need resolution before production

---

## Post-Deployment: Ongoing

### Monitoring

| What | Where |
|------|-------|
| API logs | Railway dashboard → service logs |
| Database | [Supabase Dashboard](https://supabase.com/dashboard/project/nfbgfavsjqszhchooapa) |
| Email delivery (internal) | [Resend Dashboard](https://resend.com/emails) |
| Email delivery (outreach) | Rule.io dashboard (when integrated) |
| Scraper runs | Railway dashboard → service logs |
| Health checks | `GET /api/admin/health-check` or weekly digest email |

### Regular maintenance

- [ ] Run code review skill + personal coding checklist periodically (after major changes)
- [ ] Monitor scraper digest emails — are we getting expected volumes? Adjust keywords/maxItems if needed
- [ ] Review health check digest emails — act on warnings (orphaned records, stale scrapers, data quality issues)
- [ ] Review `rejected_leads` table for processing errors — are there recurring failures?

---

## When Website Gets Custom Domain

When the website moves from `https://rookie-2-0.vercel.app` to e.g. `https://rookiework.se`:

1. Update `ALLOWED_ORIGINS` on Railway to include the new domain
2. The `WEBHOOK_URL` in the website project already points to the API — no change needed there
3. If you also want a custom API domain (e.g. `api.rookiework.se`): configure DNS CNAME to point to Railway, then update `WEBHOOK_URL` in the website project

---

## Database Merge — DONE

Merged into Kevin's `rookie-platform-database` (`nfbgfavsjqszhchooapa`). All env vars (local, Railway) point to Kevin's DB. Health check stored procedures applied and verified.

---

## Quick Reference

**Tech Stack:** TypeScript Express.js, OpenRouter (Gemini 2.5 Flash + GPT-4o-mini fallback), Supabase (Postgres), Resend (internal email), Rule.io (outreach email — planned), Apify (scrapers)

**Hosting:** Railway (Hobby plan, ~$5/mo)

**Key URLs:**
- API: `https://rookie-api-production.up.railway.app/api/health`
- Swagger docs: `https://rookie-api-production.up.railway.app/api/docs`
- Webhook: `https://rookie-api-production.up.railway.app/api/webhook`
