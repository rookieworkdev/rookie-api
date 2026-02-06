# Job Scraper Integration Tasks

## Completed - Indeed Job Scraper

- [x] Types & schemas (`src/types/scraper.types.ts`, `src/schemas/scraper.ts`)
- [x] Config (`src/config/env.ts`, `src/config/scrapers/jobs/indeed.config.ts`)
- [x] AI prompt (`src/prompts/jobEvaluation.prompt.ts`)
- [x] Indeed scraper (`src/services/jobs/indeedJobScraper.ts`)
- [x] Job processor (`src/services/jobs/jobProcessor.ts`)
- [x] Supabase operations (extended `src/services/supabaseService.ts`)
- [x] AI evaluation (extended `src/services/aiService.ts`)
- [x] API route (`src/routes/jobScraping.ts`)
- [x] Email digest (extended `src/services/emailService.ts`)

## Pending - Future Scrapers

- [ ] LinkedIn job scraper (`src/services/jobs/linkedinJobScraper.ts`)
- [ ] Arbetsformedlingen job scraper (`src/services/jobs/afJobScraper.ts`)
- [ ] Google Maps lead scraper (`src/services/leads/googleMapsLeadScraper.ts`)

## Pending - Infrastructure

- [ ] GitHub Actions cron workflow (`.github/workflows/job-scraper-cron.yml`)
- [ ] Add environment variables to deployment

## Environment Variables Required

```
OPENROUTER_API_KEY=     # For AI job evaluation
APIFY_API_KEY=          # For Apify scrapers
SCRAPER_API_KEY=        # For API authentication
SCRAPER_KEYWORDS=       # Optional: override default keywords
SCRAPER_EXCLUSION_KEYWORDS=  # Optional: comma-separated
JOB_RETENTION_DAYS=20   # Optional: defaults to 20
```

## API Endpoints

- `POST /api/scraping/jobs/indeed` - Run Indeed scraper
- `POST /api/scraping/jobs/cleanup` - Clean up old jobs
- `GET /api/scraping/jobs/health` - Health check
