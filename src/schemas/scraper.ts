import { z } from 'zod';

// Schema for raw Indeed job from Apify
// Note: Using lenient validation because Apify can return various formats
export const RawIndeedJobSchema = z.object({
  id: z.string(),
  positionName: z.string(),
  company: z.string(),
  location: z.string().optional().nullable().default(''),
  description: z.string().optional().nullable().default(''),
  // URL validation is lenient - Apify can return URLs with encoding issues
  url: z.string().min(1),
  externalApplyLink: z.string().optional().nullable(),
  postingDateParsed: z.string().optional().nullable(),
  postedAt: z.string().optional().nullable(),
  jobType: z.array(z.string()).optional().nullable(),
  salary: z.string().optional().nullable(),
});

export type RawIndeedJobType = z.infer<typeof RawIndeedJobSchema>;

// Schema for normalized job (common format)
export const NormalizedJobSchema = z.object({
  externalId: z.string(),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string(),
  description: z.string(),
  url: z.string(), // Lenient - URLs from scrapers may have various formats
  applicationUrl: z.string().optional(),
  postedAt: z.string().optional(),
  jobType: z.string().optional(),
  salary: z.string().optional(),
  source: z.enum(['indeed', 'linkedin', 'arbetsformedlingen']),
  rawData: z.record(z.unknown()),
});

export type NormalizedJobType = z.infer<typeof NormalizedJobSchema>;

// Schema for AI job evaluation response
export const JobEvaluationResultSchema = z.object({
  isValid: z.boolean(),
  score: z.number().min(0).max(100),
  category: z.string(),
  experience: z.string(),
  experience_logic: z.string(),
  reasoning: z.string(),
  applicationEmail: z.string(),
  duration: z.string(),
});

export type JobEvaluationResultType = z.infer<typeof JobEvaluationResultSchema>;

// Schema for scraper run request
export const ScraperRunRequestSchema = z.object({
  keywords: z.string().optional(),
  exclusionKeywords: z.array(z.string()).optional(),
  country: z.string().optional().default('SE'),
  maxItems: z.number().min(1).max(500).optional().default(50),
});

export type ScraperRunRequestType = z.infer<typeof ScraperRunRequestSchema>;

// Validation helpers
export function parseRawIndeedJobs(data: unknown[]): z.infer<typeof RawIndeedJobSchema>[] {
  const results: z.infer<typeof RawIndeedJobSchema>[] = [];

  // Debug: log first item's full structure to understand Apify response
  if (data.length > 0) {
    console.log('[DEBUG] First raw Apify item:', JSON.stringify(data[0], null, 2));
  }

  for (const item of data) {
    const parsed = RawIndeedJobSchema.safeParse(item);
    if (parsed.success) {
      results.push(parsed.data);
    } else {
      // Debug: log why validation failed
      console.log('[DEBUG] Job validation failed:', JSON.stringify(parsed.error.errors, null, 2));
      const itemObj = item as Record<string, unknown>;
      console.log('[DEBUG] Failed item - id:', itemObj.id, 'positionName:', itemObj.positionName, 'url:', itemObj.url);
    }
  }

  console.log(`[DEBUG] Parsed ${results.length}/${data.length} jobs successfully`);

  return results;
}

export function parseJobEvaluationResult(data: unknown): z.infer<typeof JobEvaluationResultSchema> | null {
  const parsed = JobEvaluationResultSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
