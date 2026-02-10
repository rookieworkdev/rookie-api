# Arbetsformedlingen Job Scraper Integration Plan

## Context

We are converting the existing n8n Arbetsformedlingen Job Scraper workflow (ID: `0z4QpDuBbieLgIOY`) into the TypeScript/Express codebase, following the pattern of the successfully implemented Indeed and LinkedIn scrapers. The LinkedIn scraper is the closest reference implementation - study it and the shared utilities before making changes.

**Key difference from Indeed/LinkedIn: This scraper does NOT use Apify.** It calls the free public JobTech API (`jobsearch.api.jobtechdev.se/search`) directly via HTTP GET. No Apify actor, no Apify client, no Apify costs.

**User decisions (to confirm):**
- Single flat keyword query (no categories like LinkedIn)
- 100 items per fetch (API default limit, adjustable later)
- Same AI model as Indeed/LinkedIn (GPT-4o via OpenRouter, GPT-4o-mini fallback)
- Reuse shared utilities: `filterByExclusions`, `guessCompanyDomain`, `normalizeCompanyName` from `scraperUtils.ts`
- Contact extraction: AI-extracted emails only (no API-extracted contacts like LinkedIn)
- No company enrichment beyond domain guessing (AF API doesn't provide LinkedIn/website data)
- Break into smaller tasks, test/commit/push regularly

---

## Research: n8n Arbetsformedlingen Flow Details

### API Endpoint (NOT Apify)
- **URL**: `https://jobsearch.api.jobtechdev.se/search`
- **Method**: HTTP GET (public, no auth required)
- **Query parameters**:
  - `q` = search query (flat OR-joined keyword string)
  - `limit` = 100
  - `offset` = 0
  - `published-after` = ISO date (e.g. 15 days ago)
- **Response**: JSON with `hits` array containing job objects

### Keyword Query (from Config Keywords node)
Single flat OR-joined string (no categories, no AND grouping):
```
nyexad OR nyexaminerad OR nyutbildad OR nyexaminerade OR junior OR juniors OR juniorer OR graduate OR graduates OR karriarstart OR entry level OR entry-level OR kickstart OR kickstarta OR assistent OR assistenter OR ekonom OR ekonomi OR ekonomer OR ingenjor OR ingenjorer OR engineer OR engineers OR developer OR developers OR utvecklare OR utveckling OR backendutvecklare OR frontendutvecklare OR webbutvecklare OR finans OR finance OR fintech OR bank OR tjansteman OR banktjansteman OR forsakring OR forsakringsbolag OR insurance OR redovisning OR bokforing OR accounting OR tech OR tekniker OR technician OR software OR systemutveckling OR saas OR data OR datavetenskap OR analytics OR analytiker OR dataanalys OR logistik OR logistics OR inkop OR inkopare OR upphandlare OR lager OR lagerhallning OR warehouse OR transport OR transportor OR distribution OR distributor OR sales OR saljare OR forsaljning OR marketing OR marknadsforing OR marknadsforingsassistent OR affarsutveckling OR konsult OR konsulter OR byra OR byraer OR konsultbyra OR juridik OR jurist OR advokatbyra OR lawyer OR attorney OR administration OR administrator OR admin OR projektledning OR projektledare OR kundtjanst OR customer service OR kundansvarig OR support OR kundsupport OR supportpersonal OR HR OR personalfragor OR retail OR ecommerce OR e-handel OR manufacturing OR tillverkning OR industri OR medtech OR biotech OR medicinteknik OR energi OR energy OR utility OR elektricitet OR construction OR byggnad OR telecom OR telekom OR media OR kommunikation OR gaming OR operator OR fastighetsmaklare OR maklare OR facility
```

### Exclusion Keywords
The n8n flow does NOT use a separate exclusion keyword list. Exclusions are handled entirely by the AI Agent's Stage 1 hard rejections. However, our codebase has `filterByExclusions` in `scraperUtils.ts` with the shared default list, so we should apply it for consistency.

### AF API Raw Job Fields (from Transform AF Response)
- `job.id` -> id (string, AF internal ID)
- `job.external_id` -> externalId
- `job.headline` -> title/positionName
- `job.employer.name` -> company
- `job.workplace_address.municipality` (fallback: `.region`, `.country`) -> location
- `job.description.text` (fallback: `.text_formatted`) -> description
- `job.webpage_url` -> url
- `job.application_details.url` (fallback: `webpage_url`) -> applicationUrl
- `job.application_details.email` -> applicationEmail (directly from API!)
- `job.publication_date` -> postedAt
- `job.application_deadline` -> applicationDeadline (extra field)
- `job.employment_type.label` (fallback: `duration.label`) -> jobType
- `job.salary_type.label` -> salary
- `job.number_of_vacancies` -> numberOfVacancies (extra field)
- `job.duration.label` -> duration (extra field)
- `job.removed` -> isExpired (extra field)

### Contact Extraction (simpler than LinkedIn)
Only ONE contact type per job:
- **Application Email** (AI-extracted from job description)
  - source: `arbetsformedlingen_job_ad`
  - source_method: `ai_extracted`
  - Upserted on conflict `(company_id, email)`

Note: The AF API provides `application_details.email` directly, but the n8n flow uses the AI-extracted email instead. We could use the API email as a fallback if AI doesn't find one - worth considering.

### Dedup Strategy
- Query existing `job_ads WHERE source = 'arbetsformedlingen'` for `external_id` and `external_url`
- Compare incoming jobs against this set (same as Indeed/LinkedIn)
- No cross-category dedup needed (single query, not multiple categories)

### Signal Type
`arbetsformedlingen_job_ad` (stored in `signals.signal_type`)

---

## Existing Codebase Architecture (what's already in place)

### Already Done (from LinkedIn/Indeed work)
- `JobScraperSource` type already includes `'arbetsformedlingen'`
- `ScraperRunRequestSchema` already validates for any source
- `jobProcessor.ts` pipeline is source-agnostic (dedup, AI eval, DB ops)
- `scraperUtils.ts` has shared `filterByExclusions`, `guessCompanyDomain`, `normalizeCompanyName`
- Cleanup route already handles `'arbetsformedlingen'` source
- `supabaseService.ts` has all needed DB operations
- `emailService.ts` digest is source-generic

### Fully Reusable (NO changes needed)
- `src/services/aiService.ts` - `evaluateJob()` works on NormalizedJob
- `src/services/emailService.ts` - `sendJobScraperDigestEmail()` source-generic
- `src/prompts/jobEvaluation.prompt.ts` - identical AI prompt for all scrapers
- `src/services/jobs/jobProcessor.ts` - pipeline handles AF via default (non-linkedin) branch
- `src/services/jobs/scraperUtils.ts` - shared utilities
- `src/config/env.ts` - OpenRouter config (no Apify needed for AF)
- `src/utils/logger.ts` - PII masking

### Key Simplifications vs LinkedIn
1. **No Apify** - Direct HTTP fetch to public API (simpler, free, faster)
2. **No categories** - Single query instead of 5 sequential Apify runs
3. **No company enrichment** - AF API doesn't provide LinkedIn/website data
4. **No API-extracted contacts** - Only AI-extracted email contacts (same as Indeed)
5. **No cross-category dedup** - Single query result set

---

## Implementation Plan

### Step 1: Types and schemas

**`src/types/scraper.types.ts`** - Add:
- `RawAFJob` interface with all AF API fields:
  - `id: string` (AF internal ID)
  - `external_id: string`
  - `headline: string`
  - `employer: { name: string }`
  - `workplace_address?: { municipality?: string, region?: string, country?: string }`
  - `description?: { text?: string, text_formatted?: string }`
  - `webpage_url: string`
  - `application_details?: { url?: string, email?: string }`
  - `publication_date?: string`
  - `application_deadline?: string`
  - `employment_type?: { label?: string }`
  - `salary_type?: { label?: string }`
  - `duration?: { label?: string }`
  - `number_of_vacancies?: number`
  - `removed?: boolean`
- `AFScraperConfig` interface with `source`, `apiBaseUrl`, `defaultLimit`, `defaultPublishedAfterDays`, `keywords`, `fieldMapping`

**`src/schemas/scraper.ts`** - Add:
- `RawAFJobSchema` Zod schema (lenient validation, same pattern as Indeed/LinkedIn)
- `parseRawAFJobs(data)` function

- Run typecheck
- **Commit and push**

### Step 2: AF config

**Create `src/config/scrapers/jobs/af.config.ts`:**
- Export `afConfig: AFScraperConfig` with:
  - `source: 'arbetsformedlingen'`
  - `apiBaseUrl: 'https://jobsearch.api.jobtechdev.se/search'`
  - `defaultLimit: 100`
  - `defaultPublishedAfterDays: 15`
  - `keywords: '...'` (the full OR-joined keyword string)
  - `fieldMapping` for raw -> normalized field names
- Export `defaultAFExclusionKeywords` (re-export from scraperUtils or extend)
- Export `buildAFSearchUrl(keywords, limit, publishedAfterDays)` helper

- Run typecheck
- **Commit and push**

### Step 3: AF scraper service

**Create `src/services/jobs/afJobScraper.ts`:**

**`fetchAFJobs(runConfig?)`:**
- NO Apify client needed
- Builds URL with query params: `q`, `limit`, `offset`, `published-after`
- Makes HTTP GET request (native `fetch` or similar)
- Parses response JSON, extracts `hits` array
- Validates with `parseRawAFJobs()`
- Returns `RawAFJob[]`

**`normalizeAFJob(raw: RawAFJob)`:**
- Maps AF fields to NormalizedJob:
  - `externalId: raw.id` (or `raw.external_id` - verify which is used for dedup)
  - `title: raw.headline`
  - `company: raw.employer.name`
  - `location: raw.workplace_address?.municipality || raw.workplace_address?.region || raw.workplace_address?.country || 'Sweden'`
  - `description: raw.description?.text || raw.description?.text_formatted || ''`
  - `url: raw.webpage_url`
  - `applicationUrl: raw.application_details?.url || raw.webpage_url`
  - `postedAt: raw.publication_date`
  - `jobType: raw.employment_type?.label || raw.duration?.label`
  - `salary: raw.salary_type?.label`
  - `source: 'arbetsformedlingen'`
  - `rawData: raw` (preserves extra fields like application_deadline, number_of_vacancies, application_details.email)

**`runAFFetch(runConfig?)`:**
- Orchestrates: fetchAFJobs -> normalize all -> filterByExclusions (from scraperUtils.ts)
- Returns `{ jobs: NormalizedJob[], raw: RawAFJob[] }`

- Run typecheck
- **Commit and push**

### Step 4: Route

**`src/routes/jobScraping.ts`** - Add:
- Import `runAFFetch` from `afJobScraper.ts`
- New route `POST /api/scraping/jobs/af`:
  - Same pattern as Indeed/LinkedIn routes
  - Validate request body with ScraperRunRequestSchema
  - Call `runAFFetch()` then `runJobProcessingPipeline(jobs, 'arbetsformedlingen')`
  - Fire-and-forget email digest
  - Return 200 with stats

- Run typecheck + tests
- **Commit and push**

### Step 5: Test script

**Create `src/dev/tests/runAFTest.ts`:**
- Same pattern as `runIndeedTest.ts` and `runLinkedInTest.ts`
- Import `runAFFetch`, `runJobProcessingPipeline`, `sendJobScraperDigestEmail`
- Default `maxItems: 100`

- Run typecheck
- **Commit and push**

### Step 6: End-to-end test

1. `pnpm typecheck` - no TypeScript errors
2. `pnpm test` - existing tests pass
3. Run test script: `pnpm exec tsx src/dev/tests/runAFTest.ts`
4. Verify in Supabase:
   - `SELECT count(*) FROM job_ads WHERE source = 'arbetsformedlingen'`
   - `SELECT count(*) FROM signals WHERE signal_type = 'arbetsformedlingen_job_ad'`
   - `SELECT * FROM contacts WHERE source = 'arbetsformedlingen_job_ad'`
5. Verify email digest received
6. Test with curl:
   ```
   curl -X POST http://localhost:3000/api/scraping/jobs/af \
     -H "Content-Type: application/json" \
     -H "X-API-Key: $SCRAPER_API_KEY" \
     -d '{"maxItems": 100}'
   ```

---

## Key Design Rules

1. **No Apify dependency**: AF uses a free public API. Do NOT introduce Apify client for this scraper. Use native `fetch()` for HTTP requests.

2. **Shared utilities**: Reuse `filterByExclusions`, `guessCompanyDomain`, `normalizeCompanyName` from `scraperUtils.ts` - no AF-specific versions needed.

3. **Contact extraction uses default path**: Since AF only has AI-extracted email contacts (no LinkedIn-style API contacts), the existing `extractContactFromJob()` in `jobProcessor.ts` handles this via the `else` branch (non-linkedin path). No modifications to `jobProcessor.ts` needed.

4. **No company enrichment yet**: AF API doesn't provide company LinkedIn URLs, websites, or employee counts natively. For now, the `processJob()` function skips enrichment for non-linkedin sources. However, a future enrichment step should be added (e.g. Apify scrapers, Perplexity, or similar) that looks up company info by domain/website for AF jobs (and potentially Indeed too). This is out of scope for the initial integration but should be planned as a follow-up.

5. **Application email from API as potential fallback**: The AF API provides `application_details.email` directly. Consider using this as a fallback if the AI doesn't extract an email. This would be a small enhancement to `extractContactFromJob()` or the AF normalizer.

6. **Keywords are examples**: Same as LinkedIn - the keyword string will eventually be admin-configurable from the frontend.

7. **Non-breaking changes**: All modifications must preserve existing Indeed and LinkedIn scraper functionality. Run `pnpm test` after every modification.

8. **ES Module imports**: All `.ts` imports must use `.js` extension (`import from './afJobScraper.js'`).

---

## Open Questions for Next Session

1. **Which ID for dedup?** AF provides both `job.id` (internal) and `job.external_id`. The n8n flow uses `id` for dedup. Verify which is more stable/unique.

2. **API email fallback?** Should we use `application_details.email` from the AF API as a fallback when the AI doesn't extract an email? The n8n flow ignores it, but it's free data.

3. **Published-after window?** The n8n flow uses 15 days. Is this the right lookback for the codebase version, or should it be shorter (e.g., 1-2 days like LinkedIn's 24h filter)?

4. **Limit vs maxItems?** The AF API `limit` param caps at 100 per request. For more results, pagination with `offset` would be needed. Is 100 sufficient for now?

5. **AI model consistency?** The n8n flow uses Gemini 2.5 Flash Lite as primary model. Our codebase uses GPT-4o for all scrapers. Keep GPT-4o for consistency, or switch to match n8n?

6. **Company enrichment pipeline?** AF (and Indeed) jobs lack company metadata (LinkedIn URL, website, description, employee count). A future enrichment step should scrape/lookup this data using external tools (Apify scrapers, Perplexity, etc.) based on the guessed domain or company name. Design the AF scraper so enrichment can be plugged in later without restructuring.
