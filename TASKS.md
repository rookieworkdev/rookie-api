# Rookie API — All Tasks

> **Kevin:** This is the canonical task list for rookie-api. Clone this repo and point Claude Code at this file to cross-reference with your own tasks in rookie-platform.

## Completed

- [x] Indeed job scraper (types, config, AI prompt, scraper, processor, Supabase, routes, email digest)
- [x] GitHub Actions cron workflow
- [x] Fix Zod schema validation for Apify responses
- [x] Fix Supabase insert (remove non-existent `url` column)
- [x] Merge to main
- [x] LinkedIn job scraper (all steps completed and tested end-to-end)
- [x] Arbetsformedlingen job scraper (types, config, scraper, route, test script, API email fallback, pagination). See AF_PLAN.md for details.
- [x] Integration testing of all 4 scrapers (AF, Indeed, LinkedIn, Google Maps). All pass: DB writes, dedup, referential integrity, digest emails. 7 companies correctly deduplicated across scrapers. See test results in session notes.
- [x] Railway deployment — production live, auto-deploy on push to main
- [x] Swagger docs — live with production URL, auth guide, endpoint reference
- [x] End-to-end webhook tested — form → AI classification → company + signal + contact + job ad → email
- [x] Cron jobs — 5 scheduled via `node-cron` (Indeed 06:00, LinkedIn 07:00, AF 08:00, cleanup Sunday, health digest Monday UTC)
- [x] Health check stored procedures — all 5 applied to Kevin's DB and verified
- [x] DB merge complete — all tables in Kevin's `rookie-platform-database`, env vars updated everywhere
- [x] Code review — 18 findings, fixed email XSS + axios vulnerability
- [x] Lead approval flow — webhook writes to `client_access_requests` (status=pending) + `notifications` (category=access_request) for admin portal
- [x] DB columns verified — `ai_experience`, `salary`, `published_status`, `is_active` already exist in Kevin's jobs table
- [x] Google Maps cron added — Sunday 10:00 UTC, dev mode (3 test queries, 50 items/query)
- [x] First automated scraper run verified (2026-02-18) — scrapers ran overnight, results checked and OK

## Database Changes (use Supabase MCP)

### Schema alignment with Kevin's DB (audit done 2026-02-12)

Merge strategy: **union of both schemas** — keep all columns/tables from both sides. Never drop ours just because Kevin doesn't have them. The merged DB gets everything.

**companies** (1 diff):
- [x] Remap `company_description` → `description`. Code already used `description` everywhere. Column was empty (0 rows). Dropped via migration.

**contacts** — identical columns. No action needed.

**jobs** (table rename + column diffs):
- [x] Rename `job_ads` table → `jobs` (matches Kevin). Updated 4 `.from()` calls in supabaseService.ts + comments in test scripts. All 65 tests pass. Migration applied.
- [x] Rename `job_ads_stats` table → `job_stats`. No code refs existed. Migration applied.
- [x] At merge: add `ai_experience`, `salary`, `published_status`, `is_active` to Kevin's `jobs` table — **verified: all 4 columns already exist** in Kevin's DB (2026-02-17).

**user_profiles** (diffs — resolve at merge):
- At merge: add `email`, `phone` from Kevin's. Align `role` column type (ours is text, Kevin's is enum).

### Reminder: update DB constraints when adding new sources/scrapers

When adding a new scraper or data source, check and update these:
- [ ] `scraping_signals.signal_type` — has a CHECK constraint (`chk_scraping_signals_signal_type`) limiting allowed values. Add the new signal type to the constraint via migration.
- [ ] `contacts.related_job_ad_id` — now a uuid FK to `jobs(id)`. Ensure any new contact inserts reference valid job IDs.
- [ ] Review any other enum-like text columns (e.g. `source` columns on various tables) for consistency with the new source name.

### Other DB changes
- [x] Remove `website_jobs` and `website_contacts` tables (legacy, superseded). Dropped via migration. Zero code references confirmed. Note: `website_rookies` and `website_inspiration` kept — likely consumed by frontend directly.
- [x] Investigate `backlog` value in `companies.status` column — correct behavior: default for new companies, admin portal will manage lifecycle (backlog → active → inactive). No change needed.
- [x] Fix `enrichment_status` default from `'complete'` → `'pending'` — was misleading (no enrichment done). Updated default + all 280 existing rows.
- [x] Clean up 6 orphaned `website_form` jobs with `company_id = null` (pre-existing from Jan 23, Intelliplan imports). Verified not in Kevin's DB. Deleted.
- [ ] Add pg_vector extension for AI enrichment (longer-term)

### Database merge — DONE
- [x] **Merged into Kevin's `rookie-platform-database` (`nfbgfavsjqszhchooapa`).** Tables aligned: `scraping_signals`, `scraping_rejected_leads`, `system_alerts`, `jobs`, `companies`, `contacts`. Connection strings updated in `.env` and Railway env vars. Webhook tested end-to-end against merged DB (2026-02-17).

  #### Sub-task: Apply stored procedures to Kevin's DB — DONE
  Applied 5 health check stored procedures to Kevin's DB (`nfbgfavsjqszhchooapa`) via `apply_migration` (2026-02-17). Table names were already correct (`scraping_signals`, `scraping_rejected_leads`). All 5 functions verified against live data.

  #### Sub-task: Update environment variables — DONE
  All env vars updated to point to Kevin's DB (`nfbgfavsjqszhchooapa`). Set in:
  - **Local dev:** `.env` — updated
  - **Railway (production):** 18 env vars set via Railway MCP — verified
  - **GitHub Actions:** Still has old secrets — will be cleaned up when removing GH Actions workflow

  #### Sub-task: Give Kevin access to admin endpoints — DONE
  - Kevin already has the `ROOKIE_API_KEY`
  - Swagger docs live at `https://rookie-api-production.up.railway.app/api/docs` with full endpoint reference, auth instructions, and "How to use Swagger" guide
  - Auth: `x-api-key` header via `src/middleware/scraperAuth.ts` (constant-time comparison)

---

## HIGH PRIORITY

### 1. Email & Outreach — Rule.io Integration

**Decision (2026-02-18): All outgoing emails will go through Rule.io.** Resend is only used for internal/system emails (admin alerts, scraper digests, health digests). All lead-facing and outreach emails will be handled by Rule.io.

**MVP email flow:**
1. A potential lead registers via the client form in the **rookie-platform** portal (not the old rookie_2.0 website form)
2. The form submission triggers an insert into `client_access_requests` (status = 'pending') and `notifications` (category = 'access_request') for admin users
3. Admin sees the notification in the portal and reviews the request
4. Outreach/follow-up emails to leads are sent via Rule.io (sequenced, customized)

**Important context:**
- The old web form in `rookie_2.0` will likely be deprecated and replaced by the client form already in the **rookie-platform** repo (`~/Desktop/rookie/rookie-platform`)
- Our webhook currently triggers `createClientAccessRequest()` + `notifyAdmins()` for the old form — we need to understand how the rookie-platform form triggers the same tables and adapt accordingly
- For now, the rookie-platform client form is the primary form we focus on

**DB tables involved (in Kevin's DB `nfbgfavsjqszhchooapa`):**
- `client_access_requests`: id, email, first_name, last_name, company_name, company_org_number, phone, message, status (enum: pending/approved/rejected), reviewed_by, reviewed_at, created_at, updated_at
- `notifications`: id, user_id, category (enum), title, body, href, is_read (default false), metadata (jsonb), created_at
- `notification_preferences`: id, user_id, category (enum), enabled (default true), created_at, updated_at

**Tasks:**
- [ ] Investigate how the rookie-platform client form triggers `client_access_requests` and `notifications` tables (does it insert directly via Supabase client, or call an API?)
- [ ] Integrate Rule.io for all lead-facing outreach emails (sequenced emailing with custom messages)
- [ ] Decide what data Rule.io needs from us (API integration, webhooks, or DB triggers?)
- [ ] Ensure admin notification flow works end-to-end: form submission → `client_access_requests` + `notifications` → admin sees it in portal
- [ ] Evaluate whether our current `createClientAccessRequest()` / `notifyAdmins()` in webhook.ts needs to be updated or replaced once the rookie-platform form is the primary entry point

**Deprioritized (was previously high-priority):**
- ~~Resend domain verification~~ — not needed for MVP since lead-facing emails go through Rule.io. Resend stays for internal system emails only (admin alerts, scraper digests). Can revisit if needed later.
- ~~AI Job Ad email routing decision~~ — deferred. The AI-generated job ad email was tied to the old webhook form flow. With the shift to Rule.io and the rookie-platform form, this needs to be reconsidered as part of the Rule.io outreach flow rather than a standalone email decision.
- ~~Email templates review~~ — leaving as-is for now since lead-facing emails move to Rule.io. Internal email templates (scraper digest, health digest, admin alerts) are functional and can be polished later.

### 2. Coordinate with Kevin — Admin Portal Needs

- [ ] Coordinate API endpoint design with Kevin (what data does the admin portal need?) — initial set done (jobs, companies, contacts, signals, dashboard), Kevin may need more
- [ ] Understand how the rookie-platform client form works and how it connects to `client_access_requests` / `notifications`
- [ ] If Kevin needs new endpoints or data from our API, build them

### 3. Scraper Tuning with Håkan — BEFORE GO-LIVE

**IMPORTANT: All scraper settings are currently configured for testing with low limits. Must review with Håkan before production use.**

This is related to the longer-term goal of making scraper config admin-configurable (see section below), but for now these need to be reviewed and adjusted manually in the config files.

- [ ] Review and refine search keywords for each scraper (Indeed, LinkedIn, AF) with Håkan — which roles and categories does Rookie actually target?
- [ ] Review exclusion keywords — are we filtering out roles we shouldn't? Missing exclusions?
- [ ] Review AI evaluation prompts (`src/prompts/jobEvaluation.prompt.ts` and `src/services/aiService.ts`) — are scoring criteria correct?
- [ ] Adjust `maxItems` per scraper for production volumes (currently very low for testing):

  | Scraper | Current maxItems | Suggested production | Cron |
  |---------|-----------------|---------------------|------|
  | Indeed | 50 | 200-300 | Daily 06:00 UTC |
  | LinkedIn | 10/category | 100-200/category | Daily 07:00 UTC |
  | AF | 100 | 500-1000 | Daily 08:00 UTC |
  | Google Maps | 50/query | 100-200/query | Weekly → every 2-3 months |

  First run fetches a lot, then ~20-50 new/day. Confirm these numbers with Håkan.

- [ ] Review and adjust `published-after` window per scraper
- [ ] Make sure we're not being too restrictive — missing valid opportunities is worse than a few false positives
- [ ] Remove temporary item count filters from original n8n flows (still used during testing)

---

## MEDIUM PRIORITY

### 4. Code Quality & Testing

- [ ] Run all tests locally and live. Test changes before committing.
- [ ] Add tests to `/tests` folder if needed
- [ ] Run code-review skill (`.claude/skills/code-review/`) and check personal Checklist for coding doc (`~/Desktop/Checklist for coding projects.md`) — regularly throughout the project, especially before deployments and after major changes
- [ ] Investigate `apify-client` --legacy-peer-deps issue (future compatibility issues?)
- [ ] Evaluate whether `jobScraping.ts` route file should be split into separate files per scraper (e.g. `indeedRoutes.ts`, `linkedinRoutes.ts`, `afRoutes.ts`) as more scrapers are added. Currently manageable but may grow unwieldy.
- [x] Investigate contact email tags: what happens if an email is both API-extracted and AI-extracted? **Fixed:** `upsertScrapedContact` now checks existing `source_method` before upserting — if existing is `api_extracted` and incoming is `ai_extracted`, the upsert is skipped (preserves the more valuable tag). Integration tested against live DB.
- [x] Verify scraper failure notifications: ensure admin gets email if a scraper run fails (AI failure, API error, etc.) and that job data is still saved to DB even if AI evaluation fails. **Fixed:** (1) Inner try-catch around AI eval in `processJob()` and `processCompany()` with fallback evaluation — DB writes always proceed. (2) Added `sendScraperFailureAlert()` in all 4 scraper route catch blocks. Integration tested: fallback eval stored correctly, alert email delivered.

### 5. Webhook & Form Integration

- [x] Add `experience` field from website form to webhook schema, FormData type, AI scoring prompt, and Swagger docs.
- [ ] Verify all website form fields are captured end-to-end (check the rookie-platform client form against our webhook schema — note: the old `rookie_2.0` form will likely be deprecated)
- [ ] Consider storing `experience` in a dedicated DB column (currently preserved in `raw_data` JSONB on jobs table for valid leads)

### 6. Google Maps Scraper Performance

- [ ] **Google Maps Apify actor is extremely slow** — even with `maxItems: 4`, the actor does a full geographic scan across 500 Swedish cities (16,000+ map segments, 388 search pages per query). Each query takes ~10-12 min. Investigate: (a) using location/city-specific searches instead of country-wide, (b) reducing the search radius, (c) using a different Apify actor, or (d) caching/skipping queries that have been run recently.
- [ ] Ramp up Google Maps: add more search queries from production list, increase maxItems, rotate cities

### 7. Deployment Cleanup

- [ ] Clean up old Vercel projects: `rookie-api` and `rookie-lead-qualification-form` (superseded by Railway)
- [ ] Manually trigger a scraper via Swagger and verify results in Supabase (production smoke test)

### 8. Data Quality Issues

- [x] **Multiple emails stored comma-separated in a single `email` field.** Fixed.
- [x] **Contact `full_name` populated with generic email prefixes.** Fixed.
- [ ] **Company domain generation creates fake slug-domains instead of real ones.** E.g. `rise-research-institutes-of-sweden.se` instead of `ri.se`. Impacts cross-scraper company dedup. **Deferred to enrichment** — resolving real domains requires web lookup / company data APIs.

---

## LONGER-TERM

### 9. Admin-Configurable Scraper Settings (via Admin Portal)

**Context:** Currently all scraper keywords, categories, exclusions, maxItems, and cron frequency are hardcoded in config files. The goal is to make these admin-configurable from Kevin's admin portal so Håkan/team can tune scrapers without code changes.

**This is also where we would:**
- Allow admins to manually trigger scraper runs from the portal with custom parameters (keywords, categories, country, maxItems, etc.)
- Show available parameters per Apify scraper actor (each actor has different input schemas — check Apify platform docs for each actor)
- Include cost/behavior warnings per scraper (Apify actors cost money, AF is free, Google Maps is slow)
- Do all scraper tuning from the UI instead of editing config files

**Possible approach:**
- Build `scraper_configs` DB table to store keywords, exclusions, maxItems per scraper
- Add admin API endpoints (`GET/PUT /api/admin/scraper-config/:scraper`)
- Update scrapers to read config from DB instead of hardcoded files
- Look into whether Apify has an MCP server or API we can use to discover available actor parameters dynamically
- Coordinate with Kevin for the admin portal UI

**Tasks:**
- [ ] Design `scraper_configs` table schema
- [ ] Build admin API endpoints for scraper configuration
- [ ] Update scrapers to read from DB config (with hardcoded defaults as fallback)
- [ ] Investigate Apify MCP server or API for discovering actor input schemas
- [ ] Coordinate with Kevin to build scraper management UI in admin portal
- [ ] Add manual scraper trigger functionality from admin portal

### 10. Data Enrichment Pipeline

- [ ] Add data enrichment to scrapers (review previous n8n workflows in paper notebook for what enrichment is needed — decision maker emails/contact info, company info)
- [ ] Resolving real company domains (currently fake slug-domains — see Data Quality Issues above)
- [ ] Look into: Perplexity, Juicebox, AnyEmail Finder, Dealfront, Dropcontact, LinkedIn scrapers for enrichment data

### 11. More Scrapers & Lead Sources

- [ ] Adding several more scrapers for job scraping, lead generation, etc. Explore more Apify scrapers and other sources.
- [ ] Each new lead scraper follows the same pattern: create endpoint, add cron line in `src/cron.ts`, start with few items weekly, tune, then reduce frequency.

### 12. Outreach Platform Integrations (beyond Rule.io)

- [ ] Evaluate & integrate additional outreach platforms if needed (Juicebox, HeyReach, Expandi) — Rule.io is the primary platform

### 13. AI & Infrastructure

- [ ] Add pg_vector extension for AI enrichment
- [ ] Improve keywords for all scrapers (ongoing — especially AF, current list is very broad)

---

## Reference: Completed Sections

### n8n migration (COMPLETE)

All original n8n workflows have been migrated to this codebase. This project is now the canonical source for all logic. n8n is no longer used.

### Database Health Checks (COMPLETE)

5 stored procedures + `healthCheckService.ts` + email digest + admin routes. All 19 checks across 5 categories. Cron: health digest Monday 08:00 UTC, cleanup Sunday 00:00 UTC.

### Lead Approval Flow (COMPLETE)

`createClientAccessRequest()` + `notifyAdmins()` wired into webhook.ts valid_lead case. Kevin's portal consumes via Supabase Realtime.

**Note:** This was built for the old `rookie_2.0` web form webhook. The rookie-platform client form may handle this differently — needs investigation (see High Priority task 1).

### Admin Portal Integration — Initial Set (COMPLETE)

Stats endpoints, health check endpoint, data listing endpoints (jobs, companies, contacts, signals, dashboard), authentication, Swagger docs. Kevin has the API key and Swagger URL.

### Lead Scraper Strategy (reference)

**Two types of scrapers with different cadences:**

1. **Job scrapers** (Indeed, LinkedIn, AF) — run **daily**. New jobs posted every day.
2. **Lead scrapers** (Google Maps, future ones) — run **less frequently**. Build coverage gradually:
   - **Development phase:** Weekly with few items, rotating categories/cities.
   - **Ramp-up phase:** Increase maxItems, add more queries.
   - **Maintenance phase:** Every 2-3 months once good coverage achieved.

**Current Google Maps config (dev):** 3 test queries (juristfirma, strategikonsult, it-bolag Stockholm), maxItems 50/query, weekly Sunday 10:00 UTC. Full production query list has ~40 queries across tech, legal, finance, IT, engineering, design, PR, marketing, media, real estate, life sciences, defense, telecom — spanning Stockholm, Göteborg, Malmö, Uppsala, Linköping.
